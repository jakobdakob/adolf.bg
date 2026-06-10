// KV namespace ADOLF_SUBS
//
// Key  : sha256_hex(lower(trim(email)) + "::" + EMAIL_SALT)
//        (computed by emailKey() in crypto.ts — keep both in sync)
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

  // ----- Single-device enforcement -----
  /** Fingerprint hash (UA + Accept-Language) of the device that currently
   *  holds the active session. Null/undefined = no active session yet. */
  active_device_fp?: string | null;
  /** JWT jti of the active session. The gate matches the cookie's jti
   *  claim against this; mismatch = the session was superseded by a
   *  newer login on another device. */
  active_device_jti?: string | null;
  /** ISO timestamp when the active session last hit the gate. Updated on
   *  /auth (login) but NOT on every request, to keep KV writes cheap. */
  active_device_last_seen?: string;
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

/** Set the active device fields on a sub record. Overwrites any previous
 *  active device — the previous device's cookie is now stale (its jti no
 *  longer matches) and silently treated as locked. */
export async function setActiveDevice(
  env: { ADOLF_SUBS: KVNamespace; EMAIL_SALT: string },
  email: string,
  fp: string,
  jti: string,
): Promise<void> {
  const rec = await getSubByEmail(env, email);
  if (!rec) return; // no sub → /auth wouldn't have unlocked anyway
  rec.active_device_fp = fp;
  rec.active_device_jti = jti;
  rec.active_device_last_seen = new Date().toISOString();
  await putSubByEmail(env, email, rec);
}

/** True iff the cookie's `jti` claim matches what KV says is the currently
 *  active session. Used by the gate to enforce single-device. */
export function deviceMatchesActive(rec: SubRecord | null, jti: string): boolean {
  if (!rec) return false;
  if (!rec.active_device_jti) return false; // no active device yet → not a valid session
  return rec.active_device_jti === jti;
}

/** Merge `partial` into the existing record (or create a new one). Crucially
 *  preserves `active_device_fp/jti/last_seen` and `current_period_end_iso`
 *  unless the partial explicitly sets them. This makes webhook handlers
 *  idempotent — a re-delivered Stripe event no longer wipes the active
 *  device or the future period_end. */
export async function mergeSubByEmail(
  env: { ADOLF_SUBS: KVNamespace; EMAIL_SALT: string },
  email: string,
  partial: Partial<SubRecord>,
): Promise<void> {
  const existing = await getSubByEmail(env, email);
  const merged: SubRecord = {
    stripe_customer_id: partial.stripe_customer_id ?? existing?.stripe_customer_id ?? "",
    stripe_subscription_id: partial.stripe_subscription_id ?? existing?.stripe_subscription_id,
    current_period_end_iso:
      partial.current_period_end_iso ?? existing?.current_period_end_iso ?? new Date(0).toISOString(),
    status: partial.status ?? existing?.status ?? "unknown",
    updated_at_iso: partial.updated_at_iso ?? new Date().toISOString(),
    // Preserve single-device fields unless explicitly overwritten.
    active_device_fp: partial.active_device_fp ?? existing?.active_device_fp,
    active_device_jti: partial.active_device_jti ?? existing?.active_device_jti,
    active_device_last_seen: partial.active_device_last_seen ?? existing?.active_device_last_seen,
  };
  await putSubByEmail(env, email, merged);
}
