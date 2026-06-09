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

  // ------------------------------ Topic gating
  const topic = matchTopicPath(path);
  if (topic) {
    const showcase = (env.SHOWCASE_PATHS || "").split(",").map((s) => s.trim()).filter(Boolean);
    if (showcase.includes(topicKey(topic))) {
      // Free showcase — pass through, full content.
      return fetchOrigin(req, env);
    }

    // Auth check.
    const authed = await isRequestAuthed(req, env);
    if (authed) {
      // Subscriber — full content, no rewrites.
      const r = await fetchOrigin(req, env);
      // Strip caches so an attacker can't pin a cached "authed" variant.
      const h = new Headers(r.headers);
      h.set("Cache-Control", "private, no-store");
      return new Response(r.body, { status: r.status, statusText: r.statusText, headers: h });
    }

    // Locked variant: fetch, then strip bytes server-side + inject paywall.
    const upstream = await fetchOrigin(req, env);
    if (upstream.status >= 300) return upstream; // pass through redirects/errors
    return lockHtmlResponse(upstream, {
      wordPreviewLimit: parseInt(env.WORD_PREVIEW_LIMIT, 10) || 300,
      publicOrigin: env.PUBLIC_ORIGIN,
      lang: detectLang(path),
      showcasePath: showcase[0] ?? "ortho/22",
    });
  }

  // ------------------------------ Everything else: pass through
  return fetchOrigin(req, env);
}

// ---------------------------------------------------------------------------
// Auth + origin helpers

async function isRequestAuthed(req: Request, env: Env): Promise<boolean> {
  const cookieHeader = req.headers.get("Cookie") ?? "";
  const cookies = parseCookies(cookieHeader);
  const token = cookies[env.COOKIE_NAME];
  if (!token) return false;
  const claims = await verifyJwt(token, env.JWT_SECRET);
  if (!claims) return false;

  // Fingerprint binding: cookie is valid only on the device that minted it.
  const ua = req.headers.get("User-Agent") ?? "";
  const al = req.headers.get("Accept-Language") ?? "";
  const fpNow = await fingerprintHash(ua, al, env.FP_SALT);
  if (fpNow !== claims.fp) return false;

  // Defense in depth: re-check KV. Cookie exp is capped at the period end
  // already, but a webhook may have downgraded status to canceled/past_due
  // earlier than expected.
  const rec = await getSubByEmailHash(env, claims.sub);
  if (!isActive(rec)) return false;

  return true;
}

function parseCookies(header: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx < 0) continue;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    if (k) out[k] = decodeURIComponent(v);
  }
  return out;
}

/** Fetch the origin (CF Pages via service binding, falling back to HTTP). */
async function fetchOrigin(req: Request, env: Env): Promise<Response> {
  if (env.SITE) {
    // Service binding — request goes directly to the Pages project without
    // hitting public DNS. This is the secure path.
    return env.SITE.fetch(req);
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
  return fetch(target.toString(), {
    method: req.method,
    headers,
    body: ["GET", "HEAD"].includes(req.method) ? undefined : req.body,
    redirect: "manual",
  });
}
