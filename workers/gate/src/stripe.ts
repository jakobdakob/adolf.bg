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
  /** Add a required custom field where the buyer confirms they want
   *  immediate access and waive the 14-day EU withdrawal right for
   *  content they consume. EU CRD 2011/83 art.16(m). */
  collectWithdrawalWaiver?: boolean;
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
  // `customer_creation` only applies in `mode=payment`; subscription mode
  // always creates a customer implicitly. Setting it explicitly → 400.
  body.set("locale", params.locale ?? "auto");
  // Discount codes intentionally disabled (Jakob's decision).
  body.set("allow_promotion_codes", "false");
  // Stripe rejects consent_collection[terms_of_service]=required unless a
  // ToS URL is set in the Dashboard. Either set the URL there (Settings →
  // Public details) or drop the ToS consent collection from Stripe and
  // rely on our own Terms page (linked from the paywall card and footer)
  // for ToS exposure. Until Jakob sets the URL, we skip the consent line
  // to avoid the 400. The withdrawal-waiver custom_field below still
  // gives us explicit consent for the more important EU waiver.
  body.set("billing_address_collection", "required");
  if (params.customerEmail) body.set("customer_email", params.customerEmail);

  if (params.collectWithdrawalWaiver) {
    // Required custom field. Single-option dropdown — the buyer can't
    // proceed without selecting "Yes". Stripe records the choice on the
    // session object so we have evidence of consent for the EU
    // withdrawal-right waiver. Stripe caps labels at 50 chars.
    body.set("custom_fields[0][key]", "withdrawal_waiver");
    body.set("custom_fields[0][type]", "dropdown");
    body.set("custom_fields[0][label][type]", "custom");
    body.set("custom_fields[0][label][custom]", "Immediate access (waive 14-day refund right)");
    body.set("custom_fields[0][dropdown][options][0][label]", "Yes — start now, waive withdrawal right");
    body.set("custom_fields[0][dropdown][options][0][value]", "yes");
    body.set("custom_fields[0][optional]", "false");
  }

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
