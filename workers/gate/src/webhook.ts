// /webhook/stripe — receive subscription lifecycle events.
//
// Critical: verify the signature BEFORE doing anything else; abort on
// failure with 400. Even authenticated requests from an attacker who
// knows the endpoint URL must fail the HMAC check.

import { verifyStripeSignature } from "./crypto";
import { mergeSubByEmail } from "./kv";
import { retrieveSubscription, retrieveCheckoutSession, retrieveCustomer } from "./stripe";
import { sendTemplate } from "./postmark";
import type { Env } from "./index";

type StripeEvent = {
  id: string;
  type: string;
  data: { object: Record<string, unknown> };
  created: number;
};

export async function handleStripeWebhook(req: Request, env: Env): Promise<Response> {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }
  const raw = await req.text();
  const sigHeader = req.headers.get("Stripe-Signature");
  const ok = await verifyStripeSignature(raw, sigHeader, env.STRIPE_WEBHOOK_SECRET, 300);
  if (!ok) {
    return new Response("Bad signature", { status: 400 });
  }

  let evt: StripeEvent;
  try {
    evt = JSON.parse(raw) as StripeEvent;
  } catch {
    return new Response("Bad payload", { status: 400 });
  }

  // Acknowledge fast; do durable work synchronously since KV writes are
  // tolerably quick. (No `waitUntil` to avoid silent failures here.)
  try {
    switch (evt.type) {
      case "checkout.session.completed":
        await onCheckoutCompleted(evt, env);
        break;
      case "customer.subscription.created":
      case "customer.subscription.updated":
        await onSubscriptionUpserted(evt, env);
        break;
      case "customer.subscription.deleted":
        await onSubscriptionDeleted(evt, env);
        break;
      case "invoice.paid":
        await onInvoicePaid(evt, env);
        break;
      case "invoice.payment_failed":
        await onInvoiceFailed(evt, env);
        break;
      default:
        // Unhandled — acknowledge so Stripe stops retrying.
        break;
    }
  } catch (e: unknown) {
    // Return 5xx so Stripe retries with backoff.
    const msg = e instanceof Error ? e.message : String(e);
    console.error("webhook handler failed", evt.type, msg);
    return new Response(`Handler error: ${msg}`, { status: 500 });
  }

  return new Response("ok", { status: 200 });
}

// ---------------------------------------------------------------------------
// Handlers

async function onCheckoutCompleted(evt: StripeEvent, env: Env): Promise<void> {
  const session = evt.data.object;
  const email = pickEmail(session);
  const subId = (session.subscription as string) ?? "";
  const customerId = (session.customer as string) ?? "";
  if (!email || !subId || !customerId) {
    // We can't store the record without these; retrieve session if needed.
    const full = await retrieveCheckoutSession(session.id as string, env.STRIPE_SECRET_KEY);
    const e2 = pickEmail(full);
    const s2 = (full.subscription as string) ?? subId;
    const c2 = (full.customer as string) ?? customerId;
    if (!e2 || !s2 || !c2) {
      throw new Error("checkout.session.completed missing email/sub/customer");
    }
    await upsertFromSubscription(e2, s2, c2, env);
    await sendWelcome(e2, env);
    return;
  }
  await upsertFromSubscription(email, subId, customerId, env);
  await sendWelcome(email, env);
}

async function onSubscriptionUpserted(evt: StripeEvent, env: Env): Promise<void> {
  const sub = evt.data.object;
  const customerId = (sub.customer as string) ?? "";
  if (!customerId) return;
  // Subscription events don't usually include the customer email — we
  // resolve it via Stripe's /customers/:id endpoint. This used to be a
  // silent dropper; with the lookup, Portal cancellations / plan switches
  // now flow into KV correctly.
  let email = (sub as any).customer_email as string | undefined;
  if (!email) {
    try {
      const cust = await retrieveCustomer(customerId, env.STRIPE_SECRET_KEY);
      email = (cust.email as string | undefined) ?? undefined;
    } catch (e) {
      console.warn("customer lookup failed for subscription update:", e instanceof Error ? e.message : String(e));
    }
  }
  if (!email) {
    console.warn("subscription.updated without email; skipping KV update (sub=" + (sub.id as string) + ")");
    return;
  }
  const periodEnd = pickPeriodEnd(sub);
  const status = (sub.status as string) ?? "unknown";
  await mergeSubByEmail(env, email, {
    stripe_customer_id: customerId,
    stripe_subscription_id: (sub.id as string) ?? "",
    ...(periodEnd ? { current_period_end_iso: new Date(periodEnd * 1000).toISOString() } : {}),
    status,
    updated_at_iso: new Date().toISOString(),
  });
}

async function onSubscriptionDeleted(evt: StripeEvent, env: Env): Promise<void> {
  const sub = evt.data.object;
  const customerId = (sub.customer as string) ?? "";
  let email = (sub as any).customer_email as string | undefined;
  if (!email && customerId) {
    try {
      const cust = await retrieveCustomer(customerId, env.STRIPE_SECRET_KEY);
      email = (cust.email as string | undefined) ?? undefined;
    } catch (e) {
      console.warn("customer lookup failed for subscription.deleted:", e instanceof Error ? e.message : String(e));
    }
  }
  if (!email || !customerId) return;
  // Mark canceled; preserve period end so the user keeps access until the
  // end of what they paid for.
  const periodEnd = pickPeriodEnd(sub);
  await mergeSubByEmail(env, email, {
    stripe_customer_id: customerId,
    stripe_subscription_id: (sub.id as string) ?? "",
    ...(periodEnd ? { current_period_end_iso: new Date(periodEnd * 1000).toISOString() } : {}),
    status: "canceled",
    updated_at_iso: new Date().toISOString(),
  });
}

async function onInvoicePaid(evt: StripeEvent, env: Env): Promise<void> {
  const inv = evt.data.object;
  const customerEmail = (inv.customer_email as string) ?? "";
  const subId = (inv.subscription as string) ?? "";
  if (!customerEmail || !subId) return;
  const sub = await retrieveSubscription(subId, env.STRIPE_SECRET_KEY);
  const customerId = (sub.customer as string) ?? "";
  const periodEnd = pickPeriodEnd(sub);
  const status = (sub.status as string) ?? "active";
  await mergeSubByEmail(env, customerEmail, {
    stripe_customer_id: customerId,
    stripe_subscription_id: subId,
    ...(periodEnd ? { current_period_end_iso: new Date(periodEnd * 1000).toISOString() } : {}),
    status,
    updated_at_iso: new Date().toISOString(),
  });
}

async function onInvoiceFailed(evt: StripeEvent, env: Env): Promise<void> {
  const inv = evt.data.object;
  const customerEmail = (inv.customer_email as string) ?? "";
  const subId = (inv.subscription as string) ?? "";
  if (!customerEmail || !subId) return;
  // Don't immediately revoke — Stripe's dunning will retry. Just mark
  // past_due. The cookie expiry will keep the user logged in until the
  // current period actually ends.
  const sub = await retrieveSubscription(subId, env.STRIPE_SECRET_KEY);
  const customerId = (sub.customer as string) ?? "";
  const periodEnd = pickPeriodEnd(sub);
  await mergeSubByEmail(env, customerEmail, {
    stripe_customer_id: customerId,
    stripe_subscription_id: subId,
    ...(periodEnd ? { current_period_end_iso: new Date(periodEnd * 1000).toISOString() } : {}),
    status: "past_due",
    updated_at_iso: new Date().toISOString(),
  });
}

// ---------------------------------------------------------------------------
// Helpers

async function upsertFromSubscription(
  email: string,
  subId: string,
  customerId: string,
  env: Env,
): Promise<void> {
  const sub = await retrieveSubscription(subId, env.STRIPE_SECRET_KEY);
  const periodEnd = pickPeriodEnd(sub);
  const status = (sub.status as string) ?? "active";
  // Merge — preserves any existing active_device_* fields the user has
  // already established via magic-link login, so a re-delivered webhook
  // doesn't kick them off their device.
  await mergeSubByEmail(env, email, {
    stripe_customer_id: customerId,
    stripe_subscription_id: subId,
    ...(periodEnd ? { current_period_end_iso: new Date(periodEnd * 1000).toISOString() } : {}),
    status,
    updated_at_iso: new Date().toISOString(),
  });
}

/** Pull current_period_end from a Stripe subscription object, falling back
 *  through the item-level field that newer API versions surface. Returns
 *  0 if none found — caller should treat that as "do not overwrite". */
function pickPeriodEnd(sub: Record<string, unknown>): number {
  const direct = sub.current_period_end as number | null | undefined;
  if (typeof direct === "number" && direct > 0) return direct;
  const items = (sub.items as { data?: Array<{ current_period_end?: number }> } | undefined)?.data;
  if (items && items[0] && typeof items[0].current_period_end === "number") {
    return items[0].current_period_end;
  }
  return 0;
}

function pickEmail(obj: Record<string, unknown>): string | undefined {
  return (obj.customer_email as string)
      ?? (obj.customer_details as { email?: string } | undefined)?.email
      ?? undefined;
}

async function sendWelcome(email: string, env: Env): Promise<void> {
  try {
    await sendTemplate({
      from: env.EMAIL_FROM,
      to: email,
      templateAlias: env.POSTMARK_WELCOME_TEMPLATE,
      templateModel: {
        product_url: env.PUBLIC_ORIGIN + "/bg/",
        product_url_en: env.PUBLIC_ORIGIN + "/en/",
        portal_url: env.PUBLIC_ORIGIN + "/portal",
        login_url: env.PUBLIC_ORIGIN + "/login",
      },
    }, env.POSTMARK_SERVER_TOKEN);
  } catch (e: unknown) {
    // Welcome failure shouldn't fail the webhook; user is already paid.
    console.warn("welcome email failed:", e instanceof Error ? e.message : String(e));
  }
}
