# Security model — adolf.bg paywall (Pass B)

This document captures the threat model and the mitigations Pass B implements. Read alongside `workers/gate/README.md` and `SETUP_CHECKLIST.md`.

## What we're protecting

The non-showcase topics. Showcase topics (`ortho/22`, `trauma/1`, `anatomy/8`, `ortho/11`) are intentionally free and indexable for SEO. Everything else is paid.

The asset under threat is the prose itself — text on every locked topic page. Source maps, build artifacts, and code are intentionally public (the site is built from a public GitHub repo).

## Threat model

| # | Threat | Realistic attacker | Mitigation |
|---|---|---|---|
| T1 | View-source / disable-JS reveals trimmed content | Casual visitor | Server-side stripping in Worker — bytes shipped to non-authed clients contain only the first ~300 words of prose followed by the paywall card |
| T2 | `curl https://adolf.bg/bg/ortho/1/` returns full content | Casual visitor | Same as T1 — applies to any HTTP client, not just browsers |
| T3 | Direct request to origin (`jakobdakob.github.io/adolf.bg/...`) bypasses Worker | Anyone who finds the origin URL | **Option B1 (preferred):** Migrate hosting from GH Pages to Cloudflare Pages bound to the Worker as a service binding — no public DNS for the origin. **Option B2 (interim):** GH Pages remains public; mitigated only by `noindex` to keep search engines from caching. Pass B implements the service binding code path and the wrangler.toml has the (commented-out) `[[services]]` block ready; the migration itself happens tonight |
| T4 | Search engines cache locked content | Google, Bing | Worker injects `<meta name="robots" content="noindex,nofollow">` on every locked-variant response. Showcase topics keep the site's default (indexable). |
| T5 | Wayback / archive.org snapshots | archive.org | Post-launch, file a removal request via `https://archive.org/about/contact.php` listing affected URLs. Tracked as a "tomorrow task" in the setup checklist. |
| T6 | Account sharing via cookie copy | Friend-of-friend | JWT cookie includes a `fp` claim — a hash of `User-Agent family + Accept-Language + FP_SALT`. Cookies presented by a device whose fingerprint doesn't match are ignored. Imperfect: a determined sharer can craft requests on the same browser family. Trade-off: stricter binding (e.g. IP-based) would break mobile data and VPN users. |
| T7 | Cookie XSS exfiltration | Persistent XSS in our HTML | Cookie is `HttpOnly` — script can't read it. Plus `SameSite=Lax` to limit cross-site request inclusion. Plus `Secure` — never sent over HTTP. |
| T8 | Forged JWT | Anyone | HS256 with `JWT_SECRET` (64 random bytes from `openssl rand -hex 64`). Signature is verified with constant-time comparison on every request. |
| T9 | Stripe webhook spoofing | Anyone who knows the endpoint URL | HMAC-SHA256 signature verification against `STRIPE_WEBHOOK_SECRET` with a 5-minute timestamp tolerance. Replays outside the window are rejected. |
| T10 | KV key enumeration leaks emails | Anyone with CF dashboard / backup access | KV keys are `sha256(email + EMAIL_SALT)`. `EMAIL_SALT` is a 32-byte secret. A leaked KV dump can't be reversed into email addresses. |
| T11 | Magic-link interception | Email forwarding, shared inboxes | Magic-link tokens are signed JWTs with a 15-minute TTL and a random nonce. Single use is NOT yet enforced (would need a KV "used tokens" namespace; v2 work). Risk: a forwarded link within 15 min could log in the recipient. |
| T12 | CSRF on /checkout, /portal, /logout | Standard web | `SameSite=Lax` on the auth cookie blocks cross-site POST. `/checkout` is idempotent (just creates a Stripe session). `/portal` requires auth. `/logout` clears the cookie — abuse case is mild. |
| T13 | Subdomain takeover / DNS hijack | DNS attacker | DNS is on Cloudflare after migration. CF account should have 2FA enforced. |
| T14 | Credential reuse against admin accounts | Random password attacker | Don't reuse passwords on the CF, Stripe, Postmark accounts; use a password manager; 2FA on all three. Documented in the checklist. |

## Non-mitigations (acknowledged risk)

- **Determined paying subscriber screen-recording every page**: not preventable for any web content. Out of scope.
- **Single-use magic-link enforcement**: not implemented in v1. Tokens are short-lived (15 min) but technically replayable within that window. Add a "consumed nonces" KV namespace in v2 if abuse is observed.
- **Concurrent-session limits**: not enforced. Anyone with a valid email + magic link can log in on as many devices as they want, each issuing a separate cookie. Fingerprint binding means each device counts as a session; we don't currently cap or display sessions.
- **Sub-resource integrity on origin assets**: origin is bound via service binding (or proxied), so SRI isn't a defense here; CSP is a future hardening.

## Operational rules

1. Never paste secrets into chat. The PAT shared earlier in conversation history is treated as compromised — rotate at github.com/settings/tokens immediately.
2. All secrets are set via `wrangler secret put NAME`, never in `wrangler.toml`.
3. Rotate `JWT_SECRET` if you suspect a leak. Rotation invalidates all existing cookies — users will need to log in again.
4. Never rotate `EMAIL_SALT` post-launch — it changes every KV key, orphaning all records. If you ever need to: write a one-shot script that re-keys the KV entries.
5. 2FA on Cloudflare, Stripe, Postmark, GitHub, and the registrar (Netim or wherever DNS ends up).
6. Webhook endpoint URL is not a secret per se but don't advertise it. Real protection comes from the HMAC signature check.
7. Locked content in `dist/` is still visible in the GitHub repo (which is public). That's by design — the gating happens at delivery time, not at build time. If Jakob wants the source private, the repo must go private, which breaks GH Pages on the free tier and reinforces the case for CF Pages migration.

## Post-deploy verification

After flipping to live, verify each of the following from an incognito browser (no cookies):

```bash
# Locked topic should return paywall card, not full text
curl -s https://adolf.bg/bg/ortho/1/ | grep -i "data-pw-server-locked"  # should match
curl -s https://adolf.bg/bg/ortho/1/ | grep -i "noindex,nofollow"        # should match
curl -s https://adolf.bg/bg/ortho/1/ | wc -w                             # should be small

# Showcase topic should return full content, no paywall card
curl -s https://adolf.bg/bg/ortho/22/ | grep -i "data-pw-server-locked"  # should NOT match
curl -s https://adolf.bg/bg/ortho/22/ | grep -i "noindex"                # should NOT match

# Origin direct hit (B1 = should fail; B2 = leaks content — known limitation)
curl -s https://adolf-bg-pages.pages.dev/bg/ortho/1/ | head             # depends on B1/B2
```

If T3 (origin bypass) still leaks on go-live night, do NOT flip Stripe to live until Pages migration is complete — locked content shipping in the clear at any URL nullifies the entire gate.
