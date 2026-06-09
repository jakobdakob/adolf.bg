// /checkout?plan=3|6|12 — create Stripe Checkout session, redirect to it.
//
// We deliberately do NOT pre-fill customer_email: if the visitor is already
// a subscriber on a different email, they should be sent to /portal instead;
// fresh checkout with no email lets Stripe collect it cleanly.

import { createCheckoutSession } from "./stripe";
import type { Env } from "./index";

const PLAN_LIMITS: Record<string, { months: number }> = {
  "3":  { months: 3 },
  "6":  { months: 6 },
  "12": { months: 12 },
};

export async function handleCheckout(req: Request, env: Env): Promise<Response> {
  if (req.method !== "GET" && req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }
  const url = new URL(req.url);
  const plan = url.searchParams.get("plan") ?? "";
  if (!PLAN_LIMITS[plan]) {
    return new Response("Unknown plan. Use /checkout?plan=3, 6, or 12.", { status: 400 });
  }
  const priceId =
    plan === "3"  ? env.STRIPE_PRICE_3MO  :
    plan === "6"  ? env.STRIPE_PRICE_6MO  :
                    env.STRIPE_PRICE_12MO;

  if (!priceId || priceId.startsWith("price_TODO")) {
    return new Response(
      "Stripe price IDs are not configured. The admin needs to set STRIPE_PRICE_* in wrangler.toml.",
      { status: 503 },
    );
  }

  // Locale heuristic: prefix /en/ → English. Stripe's "auto" handles the rest
  // but we steer based on the referrer path so the language matches the site.
  const ref = req.headers.get("Referer") ?? "";
  let locale: string | undefined;
  if (/\/en\//.test(ref)) locale = "en";
  else if (/\/bg\//.test(ref)) locale = "bg";

  try {
    const session = await createCheckoutSession({
      priceId,
      successUrl: `${env.PUBLIC_ORIGIN}/welcome?session={CHECKOUT_SESSION_ID}`,
      cancelUrl: `${env.PUBLIC_ORIGIN}/`,
      locale,
    }, env.STRIPE_SECRET_KEY);
    return Response.redirect(session.url, 303);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return new Response(`Could not start checkout: ${msg}`, { status: 502 });
  }
}
