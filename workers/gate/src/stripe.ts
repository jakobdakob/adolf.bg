// Minimal Stripe REST client for the Worker.
// We only need: create checkout session, retrieve subscription, create
// billing portal session. All POSTs use x-www-form-urlencoded.

const STRIPE_BASE = "https://api.stripe.com/v1";

interface StripeError {
  error?: { message?: string; type?: string; code?: string };
}

async function stripePost(
  path: string,
  body: URLSearchParams,
  secretKey: string,
): Promise<Record<string, unknown>> {
  const res = await fetch(STRIPE_BASE + path, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${secretKey}`,
      "Content-Type": "application/x-www-form-urlencoded",
      "Stripe-Version": "2024-12-18.acacia",
    },
    body,
  });
  const json = (await res.json()) as Record<string, unknown> & StripeError;
  if (!res.ok) {
    const msg = json?.error?.message ?? `Stripe error: HTTP ${res.status}`;
    throw new Error(msg);
  }
  return json;
}

async function stripeGet(
  path: string,
  secretKey: string,
): Promise<Record<string, unknown>> {
  const res = await fetch(STRIPE_BASE + path, {
    headers: {
      "Authorization": `Bearer ${secretKey}`,
      "Stripe-Version": "2024-12-18.acacia",
    },
  });
  const json = (await res.json()) as Record<string, unknown> & StripeError;
  if (!res.ok) {
    const msg = json?.error?.message ?? `Stripe error: HTTP ${res.status}`;
    throw new Error(msg);
  }
  return json;
}

export interface CreateCheckoutSessionParams {
  priceId: string;
  successUrl: string;
  cancelUrl: string;
  customerEmail?: string;
  locale?: string;
}

export async function createCheckoutSession(
  params: CreateCheckoutSessionParams,
  secretKey: string,
): Promise<{ id: string; url: string }> {
  const body = new URLSearchParams();
  body.set("mode", "subscription");
  body.set("line_items[0][price]", params.priceId);
  body.set("line_items[0][quantity]", "1");
  body.set("success_url", params.successUrl);
  body.set("cancel_url", params.cancelUrl);
  body.set("automatic_tax[enabled]", "true");
  body.set("customer_creation", "always");
  body.set("locale", params.locale ?? "auto");
  // Discount codes intentionally disabled (Jakob's decision).
  body.set("allow_promotion_codes", "false");
  body.set("consent_collection[terms_of_service]", "required");
  body.set("billing_address_collection", "required");
  if (params.customerEmail) body.set("customer_email", params.customerEmail);
  // EU consumer law: digital-content 14-day withdrawal right must be either
  // honored OR explicitly waived with consumer acknowledgment. Stripe's ToS
  // checkbox alone is not enough. Until Jakob picks the policy (see
  // SETUP_CHECKLIST.md "Withdrawal right"), we leave the standard 14-day
  // window in place by NOT auto-fulfilling immediately and NOT asking for a
  // separate waiver. The refund policy page documents this.

  const json = await stripePost("/checkout/sessions", body, secretKey);
  const id = json.id as string;
  const url = json.url as string;
  if (!id || !url) throw new Error("Stripe checkout session missing id or url");
  return { id, url };
}

export interface CreatePortalSessionParams {
  customerId: string;
  returnUrl: string;
  locale?: string;
}

export async function createPortalSession(
  params: CreatePortalSessionParams,
  secretKey: string,
): Promise<{ id: string; url: string }> {
  const body = new URLSearchParams();
  body.set("customer", params.customerId);
  body.set("return_url", params.returnUrl);
  if (params.locale) body.set("locale", params.locale);
  const json = await stripePost("/billing_portal/sessions", body, secretKey);
  const id = json.id as string;
  const url = json.url as string;
  if (!id || !url) throw new Error("Stripe portal session missing id or url");
  return { id, url };
}

export async function retrieveSubscription(
  subscriptionId: string,
  secretKey: string,
): Promise<Record<string, unknown>> {
  return stripeGet(`/subscriptions/${encodeURIComponent(subscriptionId)}`, secretKey);
}

export async function retrieveCheckoutSession(
  sessionId: string,
  secretKey: string,
): Promise<Record<string, unknown>> {
  return stripeGet(`/checkout/sessions/${encodeURIComponent(sessionId)}?expand[]=subscription`, secretKey);
}
