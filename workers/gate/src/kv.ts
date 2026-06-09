// KV namespace ADOLF_SUBS
//
// Key  : email_sha256(email + EMAIL_SALT) — hex
// Value: JSON SubRecord
//
// Why the salted hash? KV keys are visible to anyone with the CF dashboard.
// A salted hash means a list scan can't be reversed to email addresses
// even if the dashboard or backups leak.

import { emailKey } from "./crypto";

export interface SubRecord {
  /** Stripe customer ID — used to create Customer Portal sessions. */
  stripe_customer_id: string;
  /** Stripe subscription ID — useful for direct API calls. */
  stripe_subscription_id?: string;
  /** ISO-8601 timestamp at which the current paid period ends. Cookie exp
   *  is capped at this value so cancelled subs stop working at period end. */
  current_period_end_iso: string;
  /** Subscription status from Stripe — active, past_due, canceled, etc. */
  status: string;
  /** Optional ISO timestamp for last update — debugging only. */
  updated_at_iso: string;
}

export async function getSubByEmail(
  env: { ADOLF_SUBS: KVNamespace; EMAIL_SALT: string },
  email: string,
): Promise<SubRecord | null> {
  const k = await emailKey(email, env.EMAIL_SALT);
  const raw = await env.ADOLF_SUBS.get(k);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as SubRecord;
  } catch {
    return null;
  }
}

export async function putSubByEmail(
  env: { ADOLF_SUBS: KVNamespace; EMAIL_SALT: string },
  email: string,
  record: SubRecord,
): Promise<void> {
  const k = await emailKey(email, env.EMAIL_SALT);
  await env.ADOLF_SUBS.put(k, JSON.stringify(record));
}

export async function getSubByEmailHash(
  env: { ADOLF_SUBS: KVNamespace },
  emailHash: string,
): Promise<SubRecord | null> {
  const raw = await env.ADOLF_SUBS.get(emailHash);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as SubRecord;
  } catch {
    return null;
  }
}

/** Returns true iff the record exists AND status is active/trialing AND
 *  the period end is in the future. Used both at JWT-mint time (to set
 *  the cookie expiry) and at gate-time as a defense-in-depth check. */
export function isActive(rec: SubRecord | null): boolean {
  if (!rec) return false;
  const ok = rec.status === "active" || rec.status === "trialing";
  if (!ok) return false;
  const t = Date.parse(rec.current_period_end_iso);
  if (!Number.isFinite(t)) return false;
  return t > Date.now();
}
