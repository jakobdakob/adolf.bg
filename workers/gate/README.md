# adolf.bg paywall Worker

Cloudflare Worker that gates non-showcase topics behind a Stripe subscription, with magic-link login via Postmark.

## Architecture

```
Browser → adolf.bg → CF Worker (this) → CF Pages (service binding) → Astro build
                       │
                       ├─ /checkout      → Stripe Checkout
                       ├─ /webhook/stripe → KV upsert + welcome email
                       ├─ /login         → magic-link email
                       ├─ /auth          → JWT cookie issue
                       ├─ /portal        → Stripe Customer Portal
                       └─ /<topic>/      → strip bytes past 300 words for
                                          non-authed visitors, inject paywall
```

The Worker is the only public surface. The site is served from a Cloudflare Pages project bound to this Worker as a service (`env.SITE`), so the GitHub Pages origin is removed entirely — no public DNS for direct content access.

## File layout

```
src/
  index.ts          router + auth check + origin proxy
  gate.ts           server-side content stripping (HTMLRewriter-free)
  paywall-card.ts   server-rendered paywall HTML (BG/EN)
  checkout.ts       Stripe Checkout creation
  webhook.ts        Stripe webhook (signature-verified)
  auth.ts           /login, /auth, /logout, /welcome
  portal.ts         /portal → Stripe Customer Portal
  pages.ts          standalone HTML pages (login form etc.)
  stripe.ts         Stripe REST client (POST x-www-form-urlencoded)
  postmark.ts       Postmark transactional client
  kv.ts             KV record model + helpers
  crypto.ts         JWT HS256, HMAC, SHA-256, fingerprint
templates/
  magic-link.html   Postmark template body (BG + EN bilingual)
  welcome.html      Postmark template body (BG + EN bilingual)
wrangler.toml       Worker config + vars + secret list
```

## First-time setup (tonight)

See repo-root `SETUP_CHECKLIST.md` for the full step-by-step. Order matters:

1. CF account + DNS migration for `adolf.bg` (Netim → CF).
2. CF Pages project `adolf-bg-pages` connected to the GitHub repo.
3. KV namespace: `wrangler kv:namespace create "ADOLF_SUBS"`.
4. Stripe products + Tax + Customer Portal + webhook (test mode).
5. Postmark sender + DNS records + templates.
6. Secrets: `wrangler secret put NAME` for each in wrangler.toml's secret list.
7. Service binding: uncomment `[[services]]` in wrangler.toml.
8. Route: uncomment `[[routes]]` in wrangler.toml.
9. `wrangler deploy` — verify on the route.
10. End-to-end test with Stripe test card `4242 4242 4242 4242`.
11. Flip Stripe to live keys, swap webhook to live endpoint.

## Local dev

```bash
cd workers/gate
npm install
npm run typecheck
npm run dev   # local Worker against the live origin
```

`wrangler dev` will warn that secrets aren't set; you can use `.dev.vars` for local testing (gitignored).

## Cookie + JWT

- `adolf_auth=<HS256 JWT>; Domain=.adolf.bg; Path=/; HttpOnly; Secure; SameSite=Lax`
- Claims: `sub` (email hash), `iat`, `exp` (capped at subscription period end), `fp` (UA + Accept-Language fingerprint).
- Cookie expiry caps at subscription period end so cancelled subscriptions stop unlocking at period end.
- Fingerprint mismatch → cookie ignored. Mitigates trivial cross-device cookie sharing; doesn't prevent a determined sharer with the same browser-family signature.

## Webhook events handled

- `checkout.session.completed` — initial creation + welcome email
- `customer.subscription.created` / `.updated`
- `customer.subscription.deleted` — marks `canceled` but keeps access until period end
- `invoice.paid` — refreshes period end + status
- `invoice.payment_failed` — marks `past_due` without revoking immediately

## Limitations / known gaps

- The `customer.subscription.updated` handler depends on `customer_email` being present on the subscription object. If Stripe doesn't include it in a given event, the update is dropped (the next `invoice.paid` will catch up). Future: maintain a `customer_id → email_hash` lookup table in KV.
- Per-device cookie fingerprint forces the user to log in once per device.
- Without CF Pages migration, GH Pages remains a direct-content backdoor — see SECURITY.md.
