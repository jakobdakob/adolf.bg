// /portal — Stripe Customer Portal redirect.
//
// Auth required (cookie). Resolves Stripe customer id from KV by email
// hash → creates a Customer Portal session → 303 to it.

import { verifyJwt } from "./crypto";
import { getSubByEmailHash } from "./kv";
import { createPortalSession } from "./stripe";
import type { Env } from "./index";

export async function handlePortal(req: Request, env: Env): Promise<Response> {
  if (req.method !== "GET" && req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }
  const url = new URL(req.url);
  const lang = url.pathname.startsWith("/en") ? "en" : "bg";

  const cookie = req.headers.get("Cookie") ?? "";
  const token = pickCookie(cookie, env.COOKIE_NAME);
  if (!token) return Response.redirect(`${env.PUBLIC_ORIGIN}/login?lang=${lang}`, 302);

  const claims = await verifyJwt(token, env.JWT_SECRET);
  if (!claims) return Response.redirect(`${env.PUBLIC_ORIGIN}/login?lang=${lang}`, 302);

  const rec = await getSubByEmailHash(env, claims.sub);
  if (!rec || !rec.stripe_customer_id) {
    return new Response("No subscription on record.", { status: 404 });
  }
  try {
    const session = await createPortalSession({
      customerId: rec.stripe_customer_id,
      returnUrl: `${env.PUBLIC_ORIGIN}/${lang}/`,
      locale: lang,
    }, env.STRIPE_SECRET_KEY);
    return Response.redirect(session.url, 303);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return new Response(`Could not open billing portal: ${msg}`, { status: 502 });
  }
}

function pickCookie(header: string, name: string): string | null {
  for (const p of header.split(";")) {
    const idx = p.indexOf("=");
    if (idx < 0) continue;
    if (p.slice(0, idx).trim() === name) return decodeURIComponent(p.slice(idx + 1).trim());
  }
  return null;
}
