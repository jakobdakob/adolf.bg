# Pass B — Setup checklist for tonight

## Status as of 2026-06-09 evening

**Already done autonomously (commits `ee66ef2` + `a79cb48` on `paywall-pass-b`, not pushed):**

- ✅ Imprint filled with your real data (Jakob Adolf, Sofia, BG, adolf@hin.ch).
- ✅ CF zone `adolf.bg` created via API. Zone ID `9bf918e73951afb5b1f9be0ef28ab3c6`. Status currently `pending` until propagation completes.
- ✅ CF nameservers assigned: `aisha.ns.cloudflare.com`, `luke.ns.cloudflare.com`.
- ✅ Netim nameservers swapped to those two via your Netim Direct account ("BEING UPDATED" confirmed at registrar). Propagation typically 10–60 min — re-check with `dig +short NS adolf.bg` or look at the CF zone status.
- ✅ 8 DNS records added to the CF zone via API: 4× A records to GH Pages IPs, `www` CNAME, SPF TXT (`v=spf1 include:spf.mtasv.net ~all`), Postmark DKIM TXT, Postmark Return-Path CNAME.
- ✅ Postmark server `adolf-bg` created. Two templates created via Postmark API: `adolf-magic-link`, `adolf-welcome` (both Active). Server token saved at `/tmp/adolf_external_secrets/POSTMARK_SERVER_TOKEN`.
- ✅ Node 22.11 + wrangler 3.114 installed userspace at `~/.local/node` (no admin, no Homebrew).
- ✅ KV namespace `ADOLF_SUBS` created. IDs already filled into `wrangler.toml`: `8fdaff24f9fb41e9a0fb18a512b8c862` (regular), `1853458dae7444729270abe331f30bc3` (preview).
- ✅ 5 Worker secrets uploaded via `wrangler secret put`: `JWT_SECRET`, `EMAIL_SALT`, `FP_SALT`, `ORIGIN_SECRET`, `POSTMARK_SERVER_TOKEN`. (Worker `adolf-gate` was auto-created as an empty placeholder; tonight's deploy overwrites with real code.)
- ✅ Single-device enforcement shipped (JWT.jti + KV active_device_jti + kicked variant + ToS clause + per-IP rate limit). Showcase reshuffle (ortho/1, trauma/1, anatomy/1). Quiz-JSON gating + /test/ redirect.

**Heads-up (do these tonight before going further):**

1. **Rotate the Postmark server token.** It briefly appeared in a screenshot during automation. Postmark → Servers → adolf-bg → API Tokens → Generate another token, then re-pipe with `printf '%s' "<new>" | npx wrangler secret put POSTMARK_SERVER_TOKEN`.
2. **Rotate the GitHub PAT** (`github_pat_11CFIM…`) — it's been in chat history since this morning. New token only goes to your terminal, never back into chat.
3. **CF API token** at `/tmp/adolf_external_secrets/CF_API_TOKEN` expires 2026-06-11 — you can revoke it at `dash.cloudflare.com/profile/api-tokens` whenever you want.

**Still TODO tonight (~25 min of your time):**

The big remaining items are **Stripe (everything — MCP browser refused dashboard.stripe.com)**, **the final `wrangler deploy`**, **the worker route binding to `adolf.bg/*`**, and the **end-to-end test purchase** (test card has to be your hand on the keyboard).

The blocks below are still accurate for those. Skip blocks 1 (CF setup) and 4 (Postmark) — they're done. The numbered steps in block 5 are now mostly done too; only the **`STRIPE_*` price IDs** and `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` need to be set, then `wrangler deploy`.

---

Read this on your phone before sitting down at the PC. The code is already written and committed on the `paywall-pass-b` branch (not pushed). Tonight is dashboard work + secrets + first deploy.

**Order matters.** Don't skip ahead — later steps depend on identifiers from earlier ones.

> First housekeeping: there are stale `.git/HEAD.lock` and `.git/index.lock` files in the working tree from a crashed git operation. From your PC: `cd ~/Downloads/adolf.bg && rm -f .git/HEAD.lock .git/index.lock`. (The sandbox couldn't delete them because macOS denied the rm.)

> Also: **rotate the GitHub PAT** you pasted in chat earlier today (`github_pat_11CFIMFRY0XU…`). Generate a fresh one at https://github.com/settings/tokens.

---

## What changed since the original plan

Three decisions from today's iteration that the checklist now reflects:

1. **Server-side content stripping** — the Worker physically removes prose past 300 words from the response bytes for non-authed visitors. Client-side hiding (the original Pass A approach) was abandoned because view-source / disable-JS / curl trivially defeats it.
2. **Hosting migrates from GitHub Pages → Cloudflare Pages** — bound to the Worker via a service binding so there's no public DNS for direct origin access. This closes the GH Pages origin-bypass hole.
3. **No discount codes** — `allow_promotion_codes` is explicitly `false` in the checkout config. No coupon products in Stripe.

JWT cookie is hardened: `HttpOnly; Secure; SameSite=Lax; Domain=.adolf.bg`, signed HS256, with a UA + Accept-Language fingerprint claim that ignores cookies presented by a different device family. Full threat model in `SECURITY.md`.

---

## Tonight's five blocks

| # | Block | Approx time | Needs |
|---|---|---|---|
| 1 | DNS migration: Netim → Cloudflare | 10 min hands-on + 30–60 min wait | Netim login, CF account |
| 2 | CF Pages project: `adolf-bg-pages` | 10 min | GitHub access |
| 3 | Stripe — products, Tax, Portal, webhook (TEST mode) | 25 min | Stripe account |
| 4 | Postmark — sender + DNS + templates | 20 min | Postmark login |
| 5 | Worker — KV, secrets, deploy, service binding, route | 20 min | Wrangler CLI |

Then end-to-end test, fill the Imprint placeholders, flip Stripe live, push the branch.

---

## Block 1 — DNS migration to Cloudflare

Goal: `adolf.bg` is on Cloudflare so the Worker can serve traffic from `adolf.bg/*`.

1. https://dash.cloudflare.com — sign in (or create a free account if you don't already have one).
2. **Add a site** → enter `adolf.bg` → **Free plan**.
3. CF will scan your existing Netim records. Confirm all the A records to GitHub Pages and the `CNAME www → jakobdakob.github.io.` are picked up. Add them manually if any are missing — current GH Pages IPs are `185.199.108.153`, `.109.153`, `.110.153`, `.111.153`.
4. CF will show you **two nameservers** (e.g. `ada.ns.cloudflare.com`, `liam.ns.cloudflare.com`). Copy them.
5. Log into Netim → adolf.bg domain → **Change nameservers** → replace with the two CF nameservers.
6. Back in CF, click **"Check nameservers"**. Propagation is usually 10–30 min. Don't proceed past Block 5 until CF shows the site as **Active**.

While you wait, work on Blocks 2–4.

---

## Block 2 — CF Pages project

Goal: `adolf-bg-pages` Pages project deploys from GitHub, replacing GH Pages.

1. CF dashboard → **Workers & Pages** → **Create application** → **Pages** → **Connect to Git**.
2. Authorize CF to read the GitHub `jakobdakob/adolf.bg` repo.
3. Project name: `adolf-bg-pages`. Production branch: `main`.
4. Build settings:
   - Framework preset: **Astro**
   - Build command: `npm run build`
   - Build output directory: `dist`
   - Root directory: (empty)
5. Environment variables: none required (the build's `PAGES_BASE` is empty by default → builds for adolf.bg root).
6. **Save and deploy.** First build takes ~2 min.
7. After it's green, the Pages project gets a URL like `https://adolf-bg-pages.pages.dev/`. Confirm `https://adolf-bg-pages.pages.dev/bg/ortho/1/` shows the topic.
8. **Don't** add `adolf.bg` as a custom domain on the Pages project — that's reserved for the Worker.

**After Pages is live, disable GH Pages** in the GitHub repo settings → **Pages** → set source to **None**. (We're done with the GH Pages origin.)

---

## Block 3 — Stripe (TEST mode first)

Goal: 3 recurring products, Tax + Portal enabled, webhook receiving events.

> Keep Stripe in **TEST mode** for this whole block. We flip to live only after the end-to-end test passes.

### 3a — Business location decision

Pick one before creating products. This determines VAT defaults and what shows on invoices:

- **Switzerland**: no EU VAT registration needed unless you exceed €100k EU sales; reverse-charge applies. Sub-pricing is treated as B2C with destination-country VAT (Stripe Tax handles it).
- **Bulgaria**: EU member state; standard VAT registration thresholds apply.

You don't have to decide this with finality tonight, but you do have to pick one in the Stripe onboarding flow.

### 3b — Branding

Stripe Dashboard → **Settings → Branding** → upload favicon, brand color, name.

### 3c — Products

**Products → + Add product** three times. **Recurring** for all three.

| Name | Price | Billing period |
|---|---|---|
| adolf.bg — 3 months | €49.99 | Every 3 months |
| adolf.bg — 6 months | €79.99 | Every 6 months |
| adolf.bg — 12 months | €99.99 | Every 12 months |

**Pricing decision: are these VAT-inclusive (German/EU consumer convention) or VAT-exclusive?** Toggle "Tax behavior" → "Inclusive" if inclusive. The paywall card copy currently says "Prices include VAT where applicable" — keep that aligned.

After saving each, copy the **Price ID** (`price_xxx`). You'll paste them into `wrangler.toml` in Block 5.

### 3d — Tax

**Settings → Tax** → **Enable Stripe Tax**. Origin address: same as your business location. Default tax category: **digital goods / services**.

### 3e — Customer Portal

**Settings → Billing → Customer portal** → **Activate test link**.

Recommended config:
- Allow cancellation: yes, "at end of billing period"
- Allow plan switching: yes (among the 3 plans we just created)
- Update payment method: yes
- Update billing details: yes

### 3f — Webhook

**Developers → Webhooks → + Add endpoint.**

- Endpoint URL: `https://adolf.bg/webhook/stripe`
- Events:
  - `checkout.session.completed`
  - `customer.subscription.created`
  - `customer.subscription.updated`
  - `customer.subscription.deleted`
  - `invoice.paid`
  - `invoice.payment_failed`

Save → click into the new webhook → **"Signing secret"** → **Reveal** → copy it. You'll set it as `STRIPE_WEBHOOK_SECRET` in Block 5.

### 3g — API keys

**Developers → API keys** → copy:
- Publishable key (`pk_test_…`) — not used in the Worker but good to have
- **Secret key** (`sk_test_…`) — `STRIPE_SECRET_KEY` in Block 5

---

## Block 4 — Postmark

Goal: `noreply@adolf.bg` verified; two templates created.

1. Postmark dashboard → **Servers → + Add server** → name `adolf-bg`.
2. **Sender Signatures → + Add Domain** → `adolf.bg`. Copy the DKIM + Return-Path records.
3. CF dashboard → adolf.bg DNS → add:
   - DKIM TXT record (Postmark provides the exact value)
   - Return-Path CNAME (`pm-bounces.adolf.bg → pm.mtasv.net.`)
   - SPF TXT (`v=spf1 a mx include:spf.mtasv.net ~all`)
4. Back in Postmark → **Verify**. Sometimes takes a few minutes.
5. **Streams → Default Transactional** → confirm exists (Postmark creates one).
6. **Templates → + New template → Code your own**. Two templates:

| Alias | Subject | Body source |
|---|---|---|
| `adolf-magic-link` | `Вашата връзка за достъп • Your access link` | `workers/gate/templates/magic-link.html` |
| `adolf-welcome` | `Добре дошли в adolf.bg • Welcome to adolf.bg` | `workers/gate/templates/welcome.html` |

For each: paste the HTML from the template file into the HTML body field, leave the text body empty (Postmark will auto-generate), save. The aliases (`adolf-magic-link`, `adolf-welcome`) **must match** what's in `wrangler.toml` — they already do, don't change them.

7. **API Tokens → Server token** → copy. This is `POSTMARK_SERVER_TOKEN` in Block 5.

---

## Block 5 — Worker deploy

Goal: Worker live on `adolf.bg/*` with all secrets in place.

### 5a — Install wrangler

From your PC, in the repo root:

```bash
cd ~/Downloads/adolf.bg/workers/gate
npm install
npx wrangler --version    # should print 3.x
npx wrangler login        # opens browser, authenticate to CF
```

### 5b — KV namespace

```bash
npx wrangler kv:namespace create "ADOLF_SUBS"
npx wrangler kv:namespace create "ADOLF_SUBS" --preview
```

Copy the two `id =` values returned. Open `workers/gate/wrangler.toml` and paste them into the `id` and `preview_id` fields of the `[[kv_namespaces]]` block.

### 5c — Generate secrets

```bash
openssl rand -hex 64    # → JWT_SECRET
openssl rand -hex 32    # → EMAIL_SALT
openssl rand -hex 32    # → FP_SALT
openssl rand -hex 32    # → ORIGIN_SECRET
```

Save these somewhere (1Password or similar). `EMAIL_SALT` is especially load-bearing — losing it orphans every KV record and **rotating it post-launch breaks every active subscription's lookup**.

### 5d — Set secrets via wrangler

```bash
cd ~/Downloads/adolf.bg/workers/gate
npx wrangler secret put STRIPE_SECRET_KEY
# paste: sk_test_…
npx wrangler secret put STRIPE_WEBHOOK_SECRET
# paste: whsec_…
npx wrangler secret put POSTMARK_SERVER_TOKEN
# paste: the token from Block 4
npx wrangler secret put JWT_SECRET
# paste: openssl rand -hex 64 output
npx wrangler secret put EMAIL_SALT
# paste: openssl rand -hex 32 output
npx wrangler secret put FP_SALT
# paste: openssl rand -hex 32 output
npx wrangler secret put ORIGIN_SECRET
# paste: openssl rand -hex 32 output
```

### 5e — Fill in Stripe Price IDs

Open `workers/gate/wrangler.toml`. Replace:

```toml
STRIPE_PRICE_3MO  = "price_TODO_TEST_3MO"
STRIPE_PRICE_6MO  = "price_TODO_TEST_6MO"
STRIPE_PRICE_12MO = "price_TODO_TEST_12MO"
```

…with the actual `price_…` IDs from Block 3c.

### 5f — Enable Pages service binding

Still in `wrangler.toml`, uncomment the `[[services]]` block once `adolf-bg-pages` exists from Block 2:

```toml
[[services]]
binding = "SITE"
service = "adolf-bg-pages"
```

### 5g — First deploy (no route yet)

```bash
npx wrangler deploy
```

This pushes the Worker but doesn't route any traffic to it yet. The deploy output gives you `https://adolf-gate.<account>.workers.dev` — open it to confirm the Worker responds (you'll get a 404 on `/` since the Worker proxies to origin and `/` isn't gated; navigate to `/bg/` to see the landing).

### 5h — Bind to adolf.bg/* route

Once Block 1 shows the CF site as **Active**, uncomment the `[[routes]]` block in `wrangler.toml`:

```toml
[[routes]]
pattern = "adolf.bg/*"
zone_name = "adolf.bg"
```

Then `npx wrangler deploy` again.

---

## End-to-end test (TEST mode)

Do this in an incognito window — no cookies.

1. Visit `https://adolf.bg/bg/ortho/1/`. You should see the topic title, ~300 words of prose, then the paywall card.
2. `curl -s https://adolf.bg/bg/ortho/1/ | grep -i "data-pw-server-locked"` should match. `curl -s https://adolf.bg/bg/ortho/1/ | wc -w` should be small (~500-700 words including HTML).
3. `curl -s https://adolf.bg/bg/ortho/1/ | grep -i "noindex"` should show the noindex meta.
4. Visit `https://adolf.bg/bg/ortho/22/` (showcase). Full content, NO paywall card, NO noindex.
5. Click the **6 months** plan on the paywall card. Stripe Checkout opens.
6. Pay with test card `4242 4242 4242 4242`, any future expiry, any CVC, postal `00000`.
7. You should be redirected to `https://adolf.bg/welcome?session=…`.
8. Stripe dashboard → **Developers → Webhooks** → your endpoint → **Recent deliveries** — confirm `checkout.session.completed` was 200.
9. Check Postmark dashboard → **Activity** — the welcome email should have been sent.
10. Open the welcome email, click "Sign in", enter the same email → click the magic link in that email → you should land on the homepage with the cookie set.
11. Visit `https://adolf.bg/bg/ortho/1/` — full content now, no paywall card.
12. Visit `https://adolf.bg/portal` — Stripe Customer Portal opens. Cancel the subscription "at end of period".
13. Wait — your cookie should remain valid until the period end, but Stripe's webhook will mark the record as `canceled`. Subsequent fetches go through but the cookie won't be renewed when it expires.

If any step fails: `npx wrangler tail` from `workers/gate/` shows live logs.

---

## Imprint placeholders to fill

Search the repo for `TODO_IMPRINT_` — there are 6 placeholders in `src/i18n/legal.ts`. Fill in:

| Placeholder | Your value |
|---|---|
| `TODO_IMPRINT_LEGAL_NAME` | e.g. `Jakob Müller` or company name |
| `TODO_IMPRINT_ADDRESS` | Street, postal code, city |
| `TODO_IMPRINT_COUNTRY` | e.g. `Switzerland` / `Bulgaria` |
| `TODO_IMPRINT_EMAIL` | Contact email shown on Imprint page |
| `TODO_IMPRINT_REG_NUMBER` | Trade register / EIK / Steuernummer |
| `TODO_IMPRINT_VAT_NUMBER` | VAT id or "not VAT-registered" |
| `TODO_IMPRINT_RESPONSIBLE_PERSON` | Usually same as legal name |

Then rebuild Pages (push the branch and CF Pages auto-rebuilds, or `npm run build` locally first to sanity-check).

---

## Flipping to LIVE

Only after the end-to-end test passes.

1. Stripe dashboard → **toggle top-right from "Test mode" to live mode**.
2. Recreate the 3 products in live mode (Stripe's test/live data are separate). Copy the new `price_…` IDs.
3. Recreate the webhook endpoint pointing to `https://adolf.bg/webhook/stripe` for the same 6 events. Copy the new signing secret.
4. Update wrangler vars + secrets:
   ```bash
   cd ~/Downloads/adolf.bg/workers/gate
   # Edit wrangler.toml: replace STRIPE_PRICE_*_TEST_… with the live price IDs.
   npx wrangler secret put STRIPE_SECRET_KEY    # paste sk_live_…
   npx wrangler secret put STRIPE_WEBHOOK_SECRET # paste new whsec_…
   npx wrangler deploy
   ```
5. Smoke-check incognito on a non-showcase topic: locked variant shown.
6. Optional sanity: subscribe with a real card to the 3-month tier, then immediately cancel via the portal and request a refund through Stripe Dashboard (you keep your subscriber access through the period; the refund is on the original payment).

---

## Push when green

From your PC:

```bash
cd ~/Downloads/adolf.bg
rm -f .git/HEAD.lock .git/index.lock        # if not already done
git checkout paywall-pass-b
git add -A
git status                                  # sanity-check what's about to commit
git commit -m "Paywall Pass B: server-side gate + Stripe + Postmark magic-link + EU legal pages

- workers/gate/: Cloudflare Worker that physically strips prose past 300
  words for non-authed visitors and injects a server-rendered paywall card
  (no client-side hiding). HS256 JWT cookie with UA fingerprint binding.
  Stripe Checkout, webhook (signature-verified), Customer Portal,
  magic-link auth via Postmark. KV-backed subscription store keyed by
  salted-hash of the customer email.
- src/pages/[lang]/legal/: Terms, Privacy, Refund, Imprint — bilingual
  BG/EN. Imprint legal fields are TODO placeholders for now.
- src/components/CookieBanner.astro: minimal essential-only consent banner.
- Footer links to the 4 legal pages.
- SECURITY.md: threat model + post-deploy verification.
- SETUP_CHECKLIST.md: dashboard work for go-live night.

Hosting migrates to Cloudflare Pages bound to the Worker via service
binding; GH Pages is disabled to close the origin-bypass hole."
git push -u origin paywall-pass-b
```

Then open a PR `paywall-pass-b → main` so the diff is reviewable, and merge once the live smoke-check passes.

---

## Tomorrow tasks (don't do tonight)

- File Wayback Machine removal request for any archived snapshots of newly-locked topics: https://archive.org/about/contact.php — list the affected URLs.
- Consider tightening Customer Portal: disable plan-switching if you want to keep the 3 tiers cleanly separate.
- Add a `/sitemap.xml` filter that excludes locked-topic URLs (currently sitemap is generated unfiltered by the Astro sitemap integration).
- Decide on the 14-day withdrawal-right policy permanently: keep the current "honor the full 14 days" policy, or add a waiver checkbox at checkout so users can consent to immediate digital-content access (and forfeit the withdrawal right for already-consumed content). Code is wired for the former; the latter would require adding `consent_collection` extensions and a custom checkbox.
- Set up an actual support email (not `noreply@`) for refund / billing questions, and update the Imprint and Refund page accordingly.

---

**Final note:** if anything in this checklist looks wrong or stale during execution, prefer accuracy over speed. Better to pause and double-check a step than to deploy a misconfigured paywall.
