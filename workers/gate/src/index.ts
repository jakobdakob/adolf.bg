// Cloudflare Worker entry — adolf.bg paywall gate.
//
// Routing summary:
//   /checkout?plan=N         → Stripe Checkout session redirect
//   /webhook/stripe          → Stripe webhook (POST, signature-verified)
//   /login                   → email entry form (GET) / send magic link (POST)
//   /auth?token=…            → exchange magic token for auth cookie
//   /logout                  → clear cookie
//   /portal                  → Stripe Customer Portal redirect (auth required)
//   /welcome                 → post-checkout landing
//   /.well-known/health      → liveness probe
//   /bg/<sec>/<n>/...        → topic page; gated unless showcase or cookie valid
//   /en/<sec>/<n>/...        → topic page; same
//   everything else          → pass through to site origin (CF Pages or fallback)
//
// Origin fetching:
//   If env.SITE service binding is present, use it (zero-trust internal call).
//   Otherwise fall back to env.ORIGIN_URL with ORIGIN_SECRET header.

import { matchTopicPath, topicKey, detectLang, lockHtmlResponse } from "./gate";
import { handleCheckout } from "./checkout";
import { handleStripeWebhook } from "./webhook";
import { handleLogin, handleAuthExchange, handleLogout, handleWelcome } from "./auth";
import { handlePortal } from "./portal";
import { verifyJwt, fingerprintHash } from "./crypto";
import { getSubByEmailHash, isActive } from "./kv";

export interface Env {
  // Bindings
  ADOLF_SUBS: KVNamespace;
  SITE?: Fetcher; // Cloudflare Pages service binding (optional until migration)

  // Vars
  PUBLIC_ORIGIN: string;
  ORIGIN_URL: string;
  SHOWCASE_PATHS: string;
  WORD_PREVIEW_LIMIT: string;
  STRIPE_PRICE_3MO: string;
  STRIPE_PRICE_6MO: string;
  STRIPE_PRICE_12MO: string;
  COOKIE_NAME: string;
  COOKIE_DOMAIN: string;
  EMAIL_FROM: string;
  POSTMARK_MAGIC_LINK_TEMPLATE: string;
  POSTMARK_WELCOME_TEMPLATE: string;

  // Secrets
  STRIPE_SECRET_KEY: string;
  STRIPE_WEBHOOK_SECRET: string;
  POSTMARK_SERVER_TOKEN: string;
  JWT_SECRET: string;
  EMAIL_SALT: string;
  FP_SALT: string;
  ORIGIN_SECRET?: string; // optional; only used with HTTP fallback
}

export default {
  async fetch(req: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
    try {
      return await route(req, env);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("worker top-level error:", msg);
      return new Response("Internal error", { status: 500 });
    }
  },
};

async function route(req: Request, env: Env): Promise<Response> {
  const url = new URL(req.url);
  const path = url.pathname;

  // ------------------------------ Internal routes
  if (path === "/checkout" || path.startsWith("/checkout/")) {
    return handleCheckout(req, env);
  }
  if (path === "/webhook/stripe") {
    return handleStripeWebhook(req, env);
  }
  if (path === "/login" || path === "/login/") {
    return handleLogin(req, env);
  }
  if (path === "/auth" || path === "/auth/") {
    return handleAuthExchange(req, env);
  }
  if (path === "/logout" || path === "/logout/") {
    return handleLogout(req, env);
  }
  if (path === "/portal" || path === "/portal/") {
    return handlePortal(req, env);
  }
  if (path === "/welcome" || path === "/welcome/") {
    return handleWelcome(req, env);
  }
  if (path === "/.well-known/health" || path === "/healthz") {
    return new Response("ok", { status: 200, headers: { "Content-Type": "text/plain" } });
  }
  if (path === "/robots.txt") {
    // Permit indexing of free + showcase pages; locked variants carry their
    // own per-page noindex meta, so the global robots.txt stays permissive.
    return fetchOrigin(req, env);
  }

  // ------------------------------ Quiz JSON gating
  // Each topic has a /quizzes/<section>-<n>.json question pool. The bundled
  // QuizRunner fetches these client-side, so the JSON URL is the actual
  // protected resource — gating only the /test/ HTML would still leak
  // questions to anyone who curls the JSON directly.
  const quizJsonMatch = path.match(/^\/quizzes\/(ortho|trauma|anatomy)-(\d+)\.json$/);
  if (quizJsonMatch) {
    const showcase = (env.SHOWCASE_PATHS || "").split(",").map((s) => s.trim()).filter(Boolean);
    const key = `${quizJsonMatch[1]}/${quizJsonMatch[2]}`;
    if (showcase.includes(key)) return fetchOrigin(req, env);
    const auth = await checkAuth(req, env);
    if (auth.ok) return fetchOrigin(req, env);
    return new Response(JSON.stringify({ error: "subscription_required" }), {
      status: 403,
      headers: { "Content-Type": "application/json", "Cache-Control": "private, no-store" },
    });
  }
  // /quizzes/all.json — the mixed Q-bank pool. Fully gated; no showcase
  // exception (it would otherwise leak the full 7,400-question library).
  if (path === "/quizzes/all.json") {
    const auth = await checkAuth(req, env);
    if (auth.ok) return fetchOrigin(req, env);
    return new Response(JSON.stringify({ error: "subscription_required" }), {
      status: 403,
      headers: { "Content-Type": "application/json", "Cache-Control": "private, no-store" },
    });
  }

  // ------------------------------ Topic gating
  const topic = matchTopicPath(path);
  if (topic) {
    const showcase = (env.SHOWCASE_PATHS || "").split(",").map((s) => s.trim()).filter(Boolean);
    if (showcase.includes(topicKey(topic))) {
      // Free showcase — pass through, full content (incl. its /test/ page).
      return fetchOrigin(req, env);
    }

    // Auth check.
    const auth = await checkAuth(req, env);
    if (auth.ok) {
      // Subscriber on the active device — full content, no rewrites.
      const r = await fetchOrigin(req, env);
      // Strip caches so an attacker can't pin a cached "authed" variant.
      const h = new Headers(r.headers);
      h.set("Cache-Control", "private, no-store");
      return new Response(r.body, { status: r.status, statusText: r.statusText, headers: h });
    }

    // Locked. If this is the /test/ sub-route (the per-topic quiz), redirect
    // to the topic page where the prose-strip paywall renders. Stripping
    // the test page directly is a no-op (it has no `.prose` container).
    // Use the request origin so a workers.dev test doesn't bounce to the
    // (still-pending) adolf.bg.
    if (/\/test\/?$/.test(path)) {
      const topicPath = path.replace(/\/test\/?$/, "/");
      return Response.redirect(url.origin + topicPath, 302);
    }

    // Locked variant: fetch, then strip bytes server-side + inject paywall.
    // `kicked` distinguishes "valid cookie superseded by another device"
    // from "no cookie / never logged in" so the paywall can show a
    // tailored message.
    const upstream = await fetchOrigin(req, env);
    if (upstream.status >= 300) return upstream; // pass through redirects/errors
    return lockHtmlResponse(upstream, {
      wordPreviewLimit: parseInt(env.WORD_PREVIEW_LIMIT, 10) || 300,
      publicOrigin: env.PUBLIC_ORIGIN,
      lang: detectLang(path),
      showcasePath: showcase[0] ?? "ortho/1",
      kicked: auth.kicked,
    });
  }

  // ------------------------------ Q-bank landing page
  // /<lang>/qbank/ and /<lang>/qbank/mixed/ are the cross-topic quiz pages.
  // Their HTML loads /quizzes/all.json which is already gated above, so for
  // non-authed visitors the runner will fail to fetch and show empty. For a
  // cleaner UX, redirect non-authed to the home page where they can
  // navigate to a showcase topic or subscribe. Authed visitors pass through.
  const qbankMatch = path.match(/^\/(bg|en)\/qbank\b/);
  if (qbankMatch) {
    const auth = await checkAuth(req, env);
    if (!auth.ok) {
      // Use the actual request origin so testing on workers.dev doesn't
      // bounce the user to adolf.bg.
      return Response.redirect(`${url.origin}/${qbankMatch[1]}/`, 302);
    }
    const r = await fetchOrigin(req, env);
    const h = new Headers(r.headers);
    h.set("Cache-Control", "private, no-store");
    return new Response(r.body, { status: r.status, statusText: r.statusText, headers: h });
  }

  // ------------------------------ Everything else: pass through
  return fetchOrigin(req, env);
}

// ---------------------------------------------------------------------------
// Auth + origin helpers

/** Result of auth check: either ok (active session on the active device),
 *  or not-ok with a `kicked` flag indicating whether the cookie was valid
 *  but the device was superseded by a newer login on another device. */
type AuthCheck = { ok: true } | { ok: false; kicked: boolean };

async function checkAuth(req: Request, env: Env): Promise<AuthCheck> {
  const cookieHeader = req.headers.get("Cookie") ?? "";
  const cookies = parseCookies(cookieHeader);
  const token = cookies[env.COOKIE_NAME];
  if (!token) return { ok: false, kicked: false };
  const claims = await verifyJwt(token, env.JWT_SECRET);
  if (!claims) return { ok: false, kicked: false };

  // Fingerprint binding: cookie is valid only on the device family that
  // minted it (UA + Accept-Language). Mismatch = treat as no cookie.
  const ua = req.headers.get("User-Agent") ?? "";
  const al = req.headers.get("Accept-Language") ?? "";
  const fpNow = await fingerprintHash(ua, al, env.FP_SALT);
  if (fpNow !== claims.fp) return { ok: false, kicked: false };

  // Defense in depth: re-check KV. Cookie exp is capped at period end
  // already, but a webhook may have downgraded status to canceled/past_due
  // earlier than expected.
  const rec = await getSubByEmailHash(env, claims.sub);
  if (!isActive(rec)) return { ok: false, kicked: false };

  // Single-device enforcement. The cookie's jti must equal the active
  // device id stored in KV. If they differ, the user logged in elsewhere
  // and this device's session was silently superseded. Surface that to
  // the renderer so the paywall can show a tailored message.
  if (rec!.active_device_jti !== claims.jti) {
    return { ok: false, kicked: true };
  }
  return { ok: true };
}

function parseCookies(header: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx < 0) continue;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    if (!k) continue;
    // Cookie values shouldn't contain percent-encoded bytes but a
    // malformed Cookie header with stray % must not crash the route.
    try {
      out[k] = decodeURIComponent(v);
    } catch {
      out[k] = v;
    }
  }
  return out;
}

/** Fetch the origin (CF Pages via service binding, falling back to HTTP).
 *  Any `Location` header from the origin is rewritten to use the public
 *  origin so the underlying CF Pages URL (`adolf-bg.pages.dev`) is never
 *  leaked back to the browser — a redirect to that URL would bypass the
 *  gate entirely. */
async function fetchOrigin(req: Request, env: Env): Promise<Response> {
  if (env.SITE) {
    // Service binding — request goes directly to the Pages project without
    // hitting public DNS. This is the secure path.
    return rewriteOriginLocation(await env.SITE.fetch(req), req, env);
  }
  // HTTP fallback. Sends ORIGIN_SECRET so a Pages project (configured to
  // require it) can refuse direct browser hits. Until Pages is set up this
  // points at GH Pages and the secret has no effect — origin bypass is open.
  const url = new URL(req.url);
  const target = new URL(env.ORIGIN_URL.replace(/\/$/, "") + url.pathname + url.search);
  const headers = new Headers(req.headers);
  if (env.ORIGIN_SECRET) headers.set("X-Adolf-Origin-Secret", env.ORIGIN_SECRET);
  // Drop the cookie when proxying to origin — origin doesn't need it and
  // GH Pages can't read it anyway, but it leaks fewer details.
  headers.delete("Cookie");
  const r = await fetch(target.toString(), {
    method: req.method,
    headers,
    body: ["GET", "HEAD"].includes(req.method) ? undefined : req.body,
    redirect: "manual",
  });
  return rewriteOriginLocation(r, req, env);
}

function rewriteOriginLocation(r: Response, req: Request, env: Env): Response {
  if (r.status < 300 || r.status >= 400) return r;
  const loc = r.headers.get("Location");
  if (!loc) return r;
  let originHost: string;
  try {
    originHost = new URL(env.ORIGIN_URL).host;
  } catch {
    return r;
  }
  let parsed: URL;
  try {
    parsed = new URL(loc, env.ORIGIN_URL);
  } catch {
    return r;
  }
  if (parsed.host !== originHost) return r;
  const publicOrigin = new URL(req.url).origin;
  const h = new Headers(r.headers);
  h.set("Location", publicOrigin + parsed.pathname + parsed.search + parsed.hash);
  return new Response(r.body, { status: r.status, statusText: r.statusText, headers: h });
}
