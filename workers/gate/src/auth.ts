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
  sha256Hex,
  genJti,
} from "./crypto";
import { getSubByEmail, isActive, setActiveDevice } from "./kv";
import { sendTemplate } from "./postmark";
import { loginFormPage, checkEmailPage, welcomePage, errorPage } from "./pages";
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

  if (req.method === "GET") {
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
  const linkUrl = `${env.PUBLIC_ORIGIN}/auth?token=${encodeURIComponent(token)}`;

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
  if (req.method !== "GET") {
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

  const sub = await getSubByEmail(env, claims.email);
  if (!isActive(sub)) {
    // Logged-in attempt for an email without an active sub. Send them to
    // the home page; they can subscribe.
    return Response.redirect(`${env.PUBLIC_ORIGIN}/${lang}/`, 302);
  }

  // Issue auth cookie. Cap cookie expiry at the subscription period end.
  const periodEnd = Math.floor(Date.parse(sub!.current_period_end_iso) / 1000);
  const now = Math.floor(Date.now() / 1000);
  const exp = Math.min(periodEnd, now + 60 * 60 * 24 * 30); // hard cap: 30 days
  const ua = req.headers.get("User-Agent") ?? "";
  const al = req.headers.get("Accept-Language") ?? "";
  const fp = await fingerprintHash(ua, al, env.FP_SALT);
  const emailHash = await sha256Hex(claims.email + "::" + env.EMAIL_SALT);

  // Single-device enforcement: generate a fresh jti and overwrite the
  // active device record in KV. Any previously-issued cookie for this
  // email now has a stale jti; the gate treats it as kicked.
  const jti = genJti();
  await setActiveDevice(env, claims.email, fp, jti);

  const jwt = await signJwt({ sub: emailHash, iat: now, exp, fp, jti }, env.JWT_SECRET);

  const headers = new Headers();
  headers.set("Location", `${env.PUBLIC_ORIGIN}/${lang}/`);
  headers.append("Set-Cookie", buildCookie(env, jwt, exp - now));
  return new Response(null, { status: 302, headers });
}

// ---------------------------------------------------------------------------
// /logout

export async function handleLogout(req: Request, env: Env): Promise<Response> {
  const url = new URL(req.url);
  const lang = url.pathname.startsWith("/en") ? "en" : "bg";
  const headers = new Headers();
  headers.set("Location", `${env.PUBLIC_ORIGIN}/${lang}/`);
  headers.append("Set-Cookie", clearCookie(env));
  return new Response(null, { status: 302, headers });
}

// ---------------------------------------------------------------------------
// /welcome — landing after Stripe checkout success

export async function handleWelcome(req: Request, env: Env): Promise<Response> {
  const url = new URL(req.url);
  const lang = url.searchParams.get("lang") === "en" ? "en" : "bg";
  return htmlResponse(welcomePage(lang, env.PUBLIC_ORIGIN));
}

// ---------------------------------------------------------------------------
// Cookie helpers

export function buildCookie(env: Env, value: string, maxAgeSec: number): string {
  const parts = [
    `${env.COOKIE_NAME}=${value}`,
    `Domain=${env.COOKIE_DOMAIN}`,
    `Path=/`,
    `HttpOnly`,
    `Secure`,
    `SameSite=Lax`,
    `Max-Age=${Math.max(0, Math.floor(maxAgeSec))}`,
  ];
  return parts.join("; ");
}

export function clearCookie(env: Env): string {
  return [
    `${env.COOKIE_NAME}=`,
    `Domain=${env.COOKIE_DOMAIN}`,
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
