// /webhook/stripe — receive subscription lifecycle events.
//
// Critical: verify the signature BEFORE doing anything else; abort on
// failure with 400. Even authenticated requests from an attacker who
// knows the endpoint URL must fail the HMAC check.

import { verifyStripeSignature } from "./crypto";
import { putSubByEmail } from "./kv";
import { retrieveSubscription, retrieveCheckoutSession } from "./stripe";
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
  // Customer object isn't expanded here; we need the email. Fall back to
  // metadata or skip if absent — the checkout.session.completed handler is
  // the canonical creation point.
  const email = (sub as any).customer_email as string | undefined;
  if (!email) {
    // Without the email we can't compute the KV key. Webhook arrives just
    // after checkout.session.completed which DOES include the email, so
    // most updates within the same period are fine. For later edits
    // (cancellations etc.), tie via stripe_subscription_id by scanning KV
    // (not implemented v1; document as known limitation).
    return;
  }
  const periodEnd = (sub.current_period_end as number) ?? 0;
  const status = (sub.status as string) ?? "unknown";
  await putSubByEmail(env, email, {
    stripe_customer_id: customerId,
    stripe_subscription_id: (sub.id as string) ?? "",
    current_period_end_iso: new Date(periodEnd * 1000).toISOString(),
    status,
    updated_at_iso: new Date().toISOString(),
  });
}

async function onSubscriptionDeleted(evt: StripeEvent, env: Env): Promise<void> {
  const sub = evt.data.object;
  const customerId = (sub.customer as string) ?? "";
  const email = (sub as any).customer_email as string | undefined;
  if (!email || !customerId) return;
  // Mark canceled; preserve period end so the user keeps access until the
  // end of what they paid for.
  const periodEnd = (sub.current_period_end as number) ?? Math.floor(Date.now() / 1000);
  await putSubByEmail(env, email, {
    stripe_customer_id: customerId,
    stripe_subscription_id: (sub.id as string) ?? "",
    current_period_end_iso: new Date(periodEnd * 1000).toISOString(),
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
  const periodEnd = (sub.current_period_end as number) ?? 0;
  const status = (sub.status as string) ?? "active";
  await putSubByEmail(env, customerEmail, {
    stripe_customer_id: customerId,
    stripe_subscription_id: subId,
    current_period_end_iso: new Date(periodEnd * 1000).toISOString(),
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
  const periodEnd = (sub.current_period_end as number) ?? 0;
  await putSubByEmail(env, customerEmail, {
    stripe_customer_id: customerId,
    stripe_subscription_id: subId,
    current_period_end_iso: new Date(periodEnd * 1000).toISOString(),
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
  const periodEnd = (sub.current_period_end as number) ?? 0;
  const status = (sub.status as string) ?? "active";
  await putSubByEmail(env, email, {
    stripe_customer_id: customerId,
    stripe_subscription_id: subId,
    current_period_end_iso: new Date(periodEnd * 1000).toISOString(),
    status,
    updated_at_iso: new Date().toISOString(),
  });
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
