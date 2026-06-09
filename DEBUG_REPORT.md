# Pre-launch debug report — 2026-06-10

Source: thorough audit + live curl battery + sub-agent code review.
Worker version after fixes: `e7f91e2f`. Branch: `main` (pushed).

## Fixed tonight

### BLOCKER class

- **B1 — Webhook re-deliveries silently kicked the active device.** `webhook.ts`'s handlers wrote a fresh `SubRecord` JSON on every event, blanking `active_device_fp/jti/last_seen`. Stripe re-delivers events all the time (network blips, dashboard "Resend"). Result: every re-delivery would mismatch the user's cookie `jti` and they'd see the "you've been signed out" paywall on their next click. **Fix:** new `mergeSubByEmail()` in `kv.ts` — read existing record, preserve `active_device_*` and `current_period_end_iso` unless the new partial explicitly sets them. All five webhook handlers (`checkout.session.completed`, `customer.subscription.created/updated/deleted`, `invoice.paid`, `invoice.payment_failed`) now use it.

- **B2 — Magic-link tokens were replayable for their entire 15-min TTL.** A leaked link clicked twice (bot prefetchers — Microsoft Defender ATP, Gmail link-expansion, antivirus URL-scanners — these GET every link in inbound mail in some tenants) would issue two cookies, racing each other for `active_device_jti`. **Fix:** mark each `nonce` as consumed in KV with TTL 900s on first /auth use; reject if already seen.

- **B3 — `automatic_tax[enabled]=true` will 400 for any customer in a non-registered jurisdiction.** Stripe Tax has to be activated AND have nexus/registration for each region. **Not code-fixable from my side** — Jakob must verify in Stripe Dashboard → Settings → Tax that registrations cover the expected customer geographies (BG + EU OSS at minimum). If not, drop `automatic_tax`. Documented in `LAUNCH_TOMORROW.md`.

### HIGH class

- **H1 — Origin proxy was leaking the CF Pages URL via `Location`.** If `adolf-bg.pages.dev` 30x'd (trailing-slash normalization, missing pages, etc.), the browser would follow the redirect directly to the Pages origin and bypass the gate. **Fix:** `rewriteOriginLocation()` in `index.ts` — rewrites any `Location` header pointing to the origin host into the public origin. Applied to both service-binding and HTTP-fallback paths.

- **H2 — `customer.subscription.updated` events were silently dropped.** Subscription events don't include `customer_email`. The previous code returned early. **Fix:** new `retrieveCustomer()` in `stripe.ts`, called as a fallback in the handler to look up the email. Portal cancellations now actually flip status to `canceled` in KV.

- **H3 — Logout cleared the cookie client-side but left `active_device_jti` in KV.** A JWT lifted before logout could be re-presented elsewhere and still match. **Fix:** `/logout` now clears `active_device_fp/jti` in KV by looking the record up via `claims.sub` (the email hash IS the KV key).

- **H5 — Webhook clobbered `current_period_end_iso` to 1970 when Stripe omitted the field.** On a `customer.subscription.created` event for a still-incomplete sub where `current_period_end` is null, the old code wrote `new Date(0).toISOString()` → `isActive` returned false → user lost access. **Fix:** new `pickPeriodEnd()` reads top-level + item-level; if neither exists, the field is omitted from the merge (existing value preserved).

- **Curl battery — `/bg/ortho/N/test/` redirected to `adolf.bg` instead of request origin.** Even though earlier fixes had moved other redirects to `url.origin`, this one still used `env.PUBLIC_ORIGIN`. **Fix:** uses `url.origin` now.

- **Curl battery — `/portal` no-auth/kicked redirect used `env.PUBLIC_ORIGIN`.** Same fix — `url.origin`.

### MEDIUM / LOW

- **M8 — `parseCookies` called `decodeURIComponent` on raw cookie values.** A garbage cookie with stray `%` would throw `URIError` → 500. **Fix:** try/catch, fall through to raw value.

- **L1 — `postmark.ts` logged the recipient email.** PII in Worker tail logs. **Fix:** log only template alias + MessageID (or first 200 chars of body if no MessageID), drop `from=` and `to=`.

## NOT fixed (intentionally) — documented for follow-up

The full audit listed 28 findings. The above 9 fixed; the rest are deferred because they're low-impact, scope-creepy, or context-dependent. Quick reference:

| ID | Where | Why deferred |
|---|---|---|
| H4 | `auth.ts` cookie domain | Edge case for `www.adolf.bg` SEO only. Add a CF `www.→apex` redirect in DNS instead. |
| H6 | `crypto.ts` fingerprint | Reject-on-empty-UA hurts legit edge cases more than it helps. Add later if bot abuse seen. |
| M1 | JWT `iat`/`nbf` | Cosmetic; tokens are self-signed and exp-bounded. |
| M2 | SHOWCASE_PATHS validation | Misconfig would be obvious instantly. |
| M3 | Quiz JSON regex hardcoded sections | Only ortho/trauma/anatomy in the repo today. Add when a 4th section ships. |
| M4 | Non-HTML response in lockHtmlResponse | CF Pages won't serve text/plain for topic pages. |
| M5 | Fail-open when `.prose` missing | Showcase pages don't need it, locked topics' `.prose` is part of TopicLayout. Unlikely in practice. |
| M6 | `<pre>` / `<code>` confuses depth tracker | No topics currently quote HTML in code blocks. |
| M7 | `Vary: Cookie` on 403s | `Cache-Control: private, no-store` is sufficient. Add if a CDN-mode change brings caching back in. |
| M9 | Hardcoded prices in paywall card | Worth a "single source of truth" pass but only when Jakob next changes prices. |
| L2 | Welcome page link cosmetic mismatch | Cosmetic only. |
| L3 | EU VAT location heuristic | Stripe handles. |
| L4 | Nested aside removal | No topics today have nested asides. |
| L5 | Cookie banner host check | Verified correct, no bug. |
| L6 | Recommended-plan default | Marketing decision, not a bug. |
| L7 | `/test/anything-else` falls into locked path | Confirmed correct. |
| L8 | Stripe API version pin | Future-proofing, low priority. |
| N1–N5 | Nits | Boundary, magic numbers, comments. Not blocking. |

## Live route smoke test (post-fix)

```
URL: https://adolf-gate.adolf-bg.workers.dev

/                       → 200   homepage
/bg/                    → 200   home BG
/en/                    → 200   home EN
/bg/ortho/1/            → 200   showcase, full content (~150k bytes)
/bg/ortho/2/            → 200   locked, ~80k bytes, paywall card
/bg/ortho/2/test/       → 302   workers.dev/bg/ortho/2/    ✓ (was adolf.bg before fix)
/quizzes/ortho-1.json   → 200   showcase JSON served
/quizzes/ortho-2.json   → 403   gated correctly
/quizzes/all.json       → 403   gated correctly
/bg/qbank/              → 302   workers.dev/bg/             ✓
/login                  → 200   login form
/login?lang=en          → 200   EN form
/welcome                → 200   welcome page
/portal                 → 302   workers.dev/login?lang=bg   ✓ (was adolf.bg before fix)
/auth                   → 400   missing-token error page
/logout                 → 302   workers.dev/bg/             ✓
/bg/legal/terms/        → 200   ToS BG
/en/legal/imprint/      → 200   Imprint EN, Jakob Adolf data
/checkout?plan=6        → 303   Stripe Checkout URL         ✓
/.well-known/health     → 200   "ok"
/robots.txt             → 200
/sitemap.xml            → 200
/this-doesnt-exist      → 404   (origin 404)
/bg/preface/            → 404   (Astro doesn't have preface route — noted)
```

## Files touched in this debug pass

- `workers/gate/src/kv.ts` — added `mergeSubByEmail()`
- `workers/gate/src/webhook.ts` — all 5 handlers use `mergeSubByEmail`, new `pickPeriodEnd()`, customer-email fallback via `retrieveCustomer`
- `workers/gate/src/stripe.ts` — added `retrieveCustomer()`
- `workers/gate/src/index.ts` — `rewriteOriginLocation()`, `parseCookies` safety, `/test/` redirect uses `url.origin`
- `workers/gate/src/portal.ts` — redirects use `url.origin`
- `workers/gate/src/auth.ts` — single-use magic-link nonce check, `/logout` clears KV active_device
- `workers/gate/src/postmark.ts` — log scrubbing (no recipient email)

Deployed Worker version: `e7f91e2f`.
