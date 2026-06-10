// Magic-link login + JWT issuance.
//
//   /login        GET  → email entry form (BG/EN by lang param)
//                 POST → send magic link, return "check your email"
//   /auth?token=… GET  → exchange magic token for cookie, redirect home
//   /logout       GET  → clear cookie, redirect home
//   /welcome      GET  → success page after checkout, prompts user to sign in
//
// Magic tokens are HS256 JWTs with a 15-minute TTL and a random nonce. The
// auth cookie is bound to a UA + Accept-Language fingerprint so a leaked
// cookie can't be replayed on a different device.

import {
  signJwt,
  signMagicToken,
  verifyMagicToken,
  fingerprintHash,
  emailKey,
  genJti,
} from "./crypto";
import { getSubByEmail, isActive, setActiveDevice, mergeSubByEmail } from "./kv";
import { sendTemplate } from "./postmark";
import { loginFormPage, checkEmailPage, welcomePage, errorPage } from "./pages";
import { retrieveCheckoutSession, retrieveSubscription } from "./stripe";
import type { Env } from "./index";

// ---------------------------------------------------------------------------
// Per-IP rate limit for /login.
//
// Goal: stop a script from using /login as an open-relay magic-link spammer
// against arbitrary email addresses. Per-IP, not per-email — with
// single-device enforcement there is no sharing-advantage gained by
// flooding magic links, so per-email limits would only hurt legitimate
// users (cleared cookies, switched browsers, lost phone).
//
// 30 requests per IP per rolling minute. Real users never approach this.
async function checkLoginRateLimit(req: Request, env: Env): Promise<boolean> {
  const ip = req.headers.get("CF-Connecting-IP") ?? "unknown";
  const bucket = Math.floor(Date.now() / 60000);
  const key = `rl:login:${ip}:${bucket}`;
  const cur = parseInt((await env.ADOLF_SUBS.get(key)) ?? "0", 10);
  if (cur >= 30) return false;
  // expirationTtl 70s so the bucket disappears shortly after the minute
  // ends. KV is eventually consistent; bursts can slip through. That's OK
  // here — the threshold is a DoS safeguard, not a security boundary.
  await env.ADOLF_SUBS.put(key, String(cur + 1), { expirationTtl: 70 });
  return true;
}

// ---------------------------------------------------------------------------
// /login

export async function handleLogin(req: Request, env: Env): Promise<Response> {
  const url = new URL(req.url);
  const lang = url.searchParams.get("lang") === "en" ? "en" : "bg";

  // HEAD = GET semantics; Workers runtime strips body for HEAD responses.
  // Accept both so monitors and crawlers can probe the route.
  if (req.method === "GET" || req.method === "HEAD") {
    return htmlResponse(loginFormPage(lang));
  }
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  // Parse form body
  let email: string | undefined;
  const ct = (req.headers.get("Content-Type") ?? "").toLowerCase();
  if (ct.includes("application/x-www-form-urlencoded") || ct.includes("multipart/form-data")) {
    const form = await req.formData();
    const v = form.get("email");
    if (typeof v === "string") email = v;
  } else if (ct.includes("application/json")) {
    try {
      const j = (await req.json()) as { email?: string };
      email = j.email;
    } catch { /* ignore */ }
  }
  if (!email || !isPlausibleEmail(email)) {
    return htmlResponse(checkEmailPage(lang), 200);
    // Note: we ALWAYS return the same "check your email" page — even on
    // invalid email or unknown account — to avoid leaking whether the
    // address has an account. Real validation happens on the server.
  }

  const normalized = email.trim().toLowerCase();

  // Per-IP rate limit. If exceeded, silently return the same check-email
  // page so we don't leak the rate limit to spammers.
  if (!(await checkLoginRateLimit(req, env))) {
    return htmlResponse(checkEmailPage(lang), 200);
  }

  // We send the magic link regardless of whether the account exists —
  // the link only unlocks if the email is associated with an active sub.
  // (Sending to addresses that don't have a sub is fine: the click leads
  // to /checkout instead of unlocking.)
  const token = await signMagicToken(normalized, env.JWT_SECRET, 900);
  // Use the actual request origin so a /login submitted via workers.dev
  // sends a magic link that points back to workers.dev (instead of the
  // production adolf.bg domain that hasn't propagated yet).
  const linkUrl = `${url.origin}/auth?token=${encodeURIComponent(token)}`;

  try {
    await sendTemplate({
      from: env.EMAIL_FROM,
      to: normalized,
      templateAlias: env.POSTMARK_MAGIC_LINK_TEMPLATE,
      templateModel: {
        magic_link_url: linkUrl,
        expires_in_minutes: 15,
        site_url: env.PUBLIC_ORIGIN,
      },
    }, env.POSTMARK_SERVER_TOKEN);
  } catch (e: unknown) {
    // Don't reveal email-system errors to caller. Log + show generic page.
    console.error("magic link send failed:", e instanceof Error ? e.message : String(e));
  }

  return htmlResponse(checkEmailPage(lang), 200);
}

// ---------------------------------------------------------------------------
// /auth — exchange magic token for cookie

export async function handleAuthExchange(req: Request, env: Env): Promise<Response> {
  if (req.method !== "GET" && req.method !== "HEAD") {
    return new Response("Method not allowed", { status: 405 });
  }
  const url = new URL(req.url);
  const token = url.searchParams.get("token");
  const lang = url.pathname.startsWith("/en") ? "en" : "bg";
  if (!token) {
    return htmlResponse(errorPage(lang, "missing-token"), 400);
  }

  const claims = await verifyMagicToken(token, env.JWT_SECRET);
  if (!claims) {
    return htmlResponse(errorPage(lang, "invalid-or-expired"), 400);
  }

  // Single-use enforcement: refuse a magic-link whose nonce we've already
  // honored. Stops bot-prefetched links (Microsoft Defender ATP, antivirus
  // URL scanners, Gmail's link expansion) from silently consuming the
  // user's one and only login.
  const nonceKey = `ml:used:${claims.nonce}`;
  if (await env.ADOLF_SUBS.get(nonceKey)) {
    return htmlResponse(errorPage(lang, "invalid-or-expired"), 400);
  }
  // 900s ≥ the magic-link TTL so the marker outlives the token.
  await env.ADOLF_SUBS.put(nonceKey, "1", { expirationTtl: 900 });

  const sub = await getSubByEmail(env, claims.email);
  if (!isActive(sub)) {
    // Logged-in attempt for an email without an active sub. Send them to
    // the home page; they can subscribe.
    return Response.redirect(`${url.origin}/${lang}/`, 302);
  }

  // Issue auth cookie. Cap cookie expiry at the subscription period end.
  const periodEnd = Math.floor(Date.parse(sub!.current_period_end_iso) / 1000);
  const now = Math.floor(Date.now() / 1000);
  const exp = Math.min(periodEnd, now + 60 * 60 * 24 * 30); // hard cap: 30 days
  const ua = req.headers.get("User-Agent") ?? "";
  const al = req.headers.get("Accept-Language") ?? "";
  const fp = await fingerprintHash(ua, al, env.FP_SALT);
  // Use the same emailKey() helper as kv.ts so the derivation is identical
  // — never re-implement key derivation inline.
  const emailHash = await emailKey(claims.email, env.EMAIL_SALT);

  // Single-device enforcement: generate a fresh jti and overwrite the
  // active device record in KV. Any previously-issued cookie for this
  // email now has a stale jti; the gate treats it as kicked.
  const jti = genJti();
  await setActiveDevice(env, claims.email, fp, jti);

  const jwt = await signJwt({ sub: emailHash, iat: now, exp, fp, jti }, env.JWT_SECRET);

  const headers = new Headers();
  headers.set("Location", `${url.origin}/${lang}/`);
  headers.append("Set-Cookie", buildCookie(env, jwt, exp - now, url.hostname));
  return new Response(null, { status: 302, headers });
}

// ---------------------------------------------------------------------------
// /logout

export async function handleLogout(req: Request, env: Env): Promise<Response> {
  const url = new URL(req.url);
  const lang = url.pathname.startsWith("/en") ? "en" : "bg";

  // Best-effort: if the request still carries a valid cookie, clear the
  // active_device_* fields in KV so the JWT can't be re-presented on
  // another device after logout. (Cookie clear alone is client-side only.)
  try {
    const token = pickCookieFromHeader(req.headers.get("Cookie") ?? "", env.COOKIE_NAME);
    if (token) {
      const { verifyJwt } = await import("./crypto");
      const claims = await verifyJwt(token, env.JWT_SECRET);
      if (claims) {
        // We don't have the email plaintext, only sha256 of it. We can't
        // recompute the KV key without the salt+email. So look up by
        // sub-hash: that's our KV key already.
        const raw = await env.ADOLF_SUBS.get(claims.sub);
        if (raw) {
          const rec = JSON.parse(raw);
          rec.active_device_fp = null;
          rec.active_device_jti = null;
          rec.active_device_last_seen = new Date().toISOString();
          await env.ADOLF_SUBS.put(claims.sub, JSON.stringify(rec));
        }
      }
    }
  } catch {
    // Logout must never fail noisily.
  }

  const headers = new Headers();
  headers.set("Location", `${url.origin}/${lang}/`);
  headers.append("Set-Cookie", clearCookie(env, url.hostname));
  return new Response(null, { status: 302, headers });
}

function pickCookieFromHeader(header: string, name: string): string | null {
  for (const p of header.split(";")) {
    const idx = p.indexOf("=");
    if (idx < 0) continue;
    if (p.slice(0, idx).trim() === name) {
      try { return decodeURIComponent(p.slice(idx + 1).trim()); }
      catch { return p.slice(idx + 1).trim(); }
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// /welcome — landing after Stripe checkout success
//
// Auto-login: if the URL carries a Stripe Checkout session_id, we retrieve
// the session, verify it's paid, set up the KV record (idempotent with the
// webhook), and issue the auth cookie immediately — so the user is unlocked
// the second they land here, without needing to wait for the magic-link
// email. The magic-link flow is still the path for re-login from another
// device or after the cookie expires.

export async function handleWelcome(req: Request, env: Env): Promise<Response> {
  const url = new URL(req.url);
  const lang = url.searchParams.get("lang") === "en" ? "en" : "bg";
  const sessionId = url.searchParams.get("session");

  // No session_id → static welcome page with manual sign-in CTA.
  if (!sessionId) {
    return htmlResponse(welcomePage(lang, url.origin));
  }

  let email: string | null = null;
  let customerId: string | null = null;
  let subscriptionId: string | null = null;
  try {
    const session = await retrieveCheckoutSession(sessionId, env.STRIPE_SECRET_KEY) as {
      payment_status?: string;
      customer_email?: string;
      customer_details?: { email?: string };
      customer?: string;
      subscription?: string | { id?: string };
    };
    if (session && session.payment_status === "paid") {
      email = session.customer_email
        ?? session.customer_details?.email
        ?? null;
      customerId = session.customer ?? null;
      subscriptionId = typeof session.subscription === "string"
        ? session.subscription
        : session.subscription?.id ?? null;
    }
  } catch (e: unknown) {
    console.error("welcome: session retrieve failed:", e instanceof Error ? e.message : String(e));
  }

  // Couldn't authenticate from the session — fall back to manual flow.
  if (!email || !customerId || !subscriptionId) {
    return htmlResponse(welcomePage(lang, url.origin));
  }

  let periodEndIso: string | null = null;
  try {
    const sub = await retrieveSubscription(subscriptionId, env.STRIPE_SECRET_KEY) as {
      current_period_end?: number;
    };
    if (typeof sub?.current_period_end === "number") {
      periodEndIso = new Date(sub.current_period_end * 1000).toISOString();
    }
  } catch (e: unknown) {
    console.error("welcome: sub retrieve failed:", e instanceof Error ? e.message : String(e));
  }

  if (!periodEndIso) {
    return htmlResponse(welcomePage(lang, url.origin));
  }

  // Upsert KV (idempotent with webhook). Single-device enforcement: issuing
  // a cookie here generates a fresh jti that overwrites any prior active
  // device for this email.
  const normalized = email.trim().toLowerCase();
  const ua = req.headers.get("User-Agent") ?? "";
  const al = req.headers.get("Accept-Language") ?? "";
  const fp = await fingerprintHash(ua, al, env.FP_SALT);
  const jti = genJti();

  await mergeSubByEmail(env, normalized, {
    stripe_customer_id: customerId,
    current_period_end_iso: periodEndIso,
  });
  await setActiveDevice(env, normalized, fp, jti);

  // Issue cookie. Cap at the subscription period end (with 30-day max).
  const periodEnd = Math.floor(Date.parse(periodEndIso) / 1000);
  const now = Math.floor(Date.now() / 1000);
  const exp = Math.min(periodEnd, now + 60 * 60 * 24 * 30);
  const emailHash = await emailKey(normalized, env.EMAIL_SALT);
  const jwt = await signJwt({ sub: emailHash, iat: now, exp, fp, jti }, env.JWT_SECRET);

  // Redirect to the language home so the user immediately sees they're
  // unlocked. Set-Cookie carries the new auth cookie.
  const headers = new Headers();
  headers.set("Location", `${url.origin}/${lang}/`);
  headers.append("Set-Cookie", buildCookie(env, jwt, exp - now, url.hostname));
  return new Response(null, { status: 302, headers });
}

// ---------------------------------------------------------------------------
// Cookie helpers

/** Build the auth cookie. If the request host is the production
 *  apex (adolf.bg or *.adolf.bg) we pin the Domain to .adolf.bg so the
 *  cookie is shared across subdomains. For any other host (e.g. the
 *  workers.dev test URL) we omit Domain so the cookie is host-scoped —
 *  otherwise the browser would reject a Domain attribute that doesn't
 *  match the current host. */
export function buildCookie(env: Env, value: string, maxAgeSec: number, host?: string): string {
  const useApexDomain = !host || host === "adolf.bg" || host.endsWith(".adolf.bg");
  const parts = [
    `${env.COOKIE_NAME}=${value}`,
    ...(useApexDomain ? [`Domain=${env.COOKIE_DOMAIN}`] : []),
    `Path=/`,
    `HttpOnly`,
    `Secure`,
    `SameSite=Lax`,
    `Max-Age=${Math.max(0, Math.floor(maxAgeSec))}`,
  ];
  return parts.join("; ");
}

export function clearCookie(env: Env, host?: string): string {
  const useApexDomain = !host || host === "adolf.bg" || host.endsWith(".adolf.bg");
  return [
    `${env.COOKIE_NAME}=`,
    ...(useApexDomain ? [`Domain=${env.COOKIE_DOMAIN}`] : []),
    `Path=/`,
    `HttpOnly`,
    `Secure`,
    `SameSite=Lax`,
    `Max-Age=0`,
  ].join("; ");
}

function htmlResponse(body: string, status = 200): Response {
  return new Response(body, {
    status,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "private, no-store",
      "X-Frame-Options": "SAMEORIGIN",
      "Referrer-Policy": "strict-origin-when-cross-origin",
    },
  });
}

function isPlausibleEmail(s: string): boolean {
  // Server-side validation: cheap regex, not RFC 5322 perfect. We rely on
  // Postmark to actually deliver; bounces are out of scope here.
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());
}
