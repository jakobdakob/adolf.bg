// Server-rendered paywall card markup, injected into locked topics.
//
// Pure string templates — no client JS required. Styles inline so the
// card is functional even with no stylesheet, then enhanced by the
// site's CSS variables when they're present.

import type { GateConfig } from "./gate";

interface Strings {
  heading: string;
  lede: string;
  alreadySub: string;
  loginCta: string;
  preview: string;
  previewCta: string;
  perMonthSuffix: string;
  plan3Title: string; plan3Price: string; plan3Note: string;
  plan6Title: string; plan6Price: string; plan6Note: string;
  plan12Title: string; plan12Price: string; plan12Note: string;
  legalNote: string;
  termsLink: string;
  refundLink: string;
  privacyLink: string;
  /** Kicked-out variant copy — shown when the cookie's jti has been
   *  superseded by a login on another device. */
  kickedHeading: string;
  kickedLede: string;
  kickedCta: string;
}

const BG: Strings = {
  heading: "Достъп до пълната тема",
  lede: "Този компендиум се поддържа от абонати. Изберете план — отписване е възможно по всяко време от профила.",
  alreadySub: "Вече сте абонат?",
  loginCta: "Вход с email",
  preview: "Искате първо да погледнете?",
  previewCta: "Безплатна примерна тема",
  perMonthSuffix: "/мес.",
  plan3Title: "3 месеца",
  plan3Price: "€49.99",
  plan3Note: "≈ €16.66 / мес. · подновяване на всеки 3 мес.",
  plan6Title: "6 месеца",
  plan6Price: "€79.99",
  plan6Note: "≈ €13.33 / мес. · подновяване на всеки 6 мес.",
  plan12Title: "12 месеца",
  plan12Price: "€99.99",
  plan12Note: "≈ €8.33 / мес. · подновяване всяка година",
  legalNote: "Цените са с включен ДДС, ако е приложимо. Автоматично подновяване — можете да отпишете по всяко време.",
  termsLink: "Общи условия",
  refundLink: "Право на отказ",
  privacyLink: "Поверителност",
  kickedHeading: "Излязохте от това устройство",
  kickedLede: "Излязохте от това устройство, защото влязохте от друго. Поискайте нов вход тук.",
  kickedCta: "Нов вход с email",
};

const EN: Strings = {
  heading: "Access the full topic",
  lede: "This compendium is supported by subscribers. Pick a plan — cancel any time from your account.",
  alreadySub: "Already a subscriber?",
  loginCta: "Sign in by email",
  preview: "Want to look around first?",
  previewCta: "Free sample topic",
  perMonthSuffix: "/mo",
  plan3Title: "3 months",
  plan3Price: "€49.99",
  plan3Note: "≈ €16.66 / mo · renews every 3 months",
  plan6Title: "6 months",
  plan6Price: "€79.99",
  plan6Note: "≈ €13.33 / mo · renews every 6 months",
  plan12Title: "12 months",
  plan12Price: "€99.99",
  plan12Note: "≈ €8.33 / mo · renews yearly",
  legalNote: "Prices include VAT where applicable. Auto-renews — cancel any time.",
  termsLink: "Terms",
  refundLink: "Refunds",
  privacyLink: "Privacy",
  kickedHeading: "You've been signed out of this device",
  kickedLede: "You've been signed out because you signed in on another device. Get a new sign-in link here.",
  kickedCta: "Send me a new sign-in link",
};

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Single CSS block shared by both the regular and the "kicked" variants.
// Variables (--bg, --rule, --accent, --ink-soft) are inherited from the
// site's stylesheet; fallbacks kept so the card is functional even on
// pages that don't load global CSS.
const SHARED_CSS = `<style>
/* Fade overlay over the last bit of preserved prose. Tall + aggressive
 * so the last several paragraphs dissolve into the background. */
.adolf-prose-fade {
  position: relative;
  height: 520px;
  margin-top: -480px;
  margin-bottom: -340px;
  background: linear-gradient(to bottom,
    transparent 0%,
    var(--bg, #FAF9F7) 50%,
    var(--bg, #FAF9F7) 100%);
  pointer-events: none;
  z-index: 1;
}
@media (prefers-color-scheme: dark) {
  .adolf-prose-fade {
    background: linear-gradient(to bottom,
      transparent 0%,
      var(--bg, #0F0F12) 50%,
      var(--bg, #0F0F12) 100%);
  }
}
/* Paywall floats over the fade region with sticky bottom positioning
 * — so as you scroll past, the card stays anchored to the viewport
 * bottom (with a comfortable gap from the cookie banner). */
.adolf-paywall {
  position: sticky;
  bottom: 1.5rem;
  z-index: 10;
  margin: 0 auto 2rem;
  padding: 0 0.5rem;
  max-width: 600px;
}
.adolf-paywall-card {
  position: relative;
  z-index: 10;
  border: 1px solid var(--rule, rgba(0,0,0,0.12));
  border-radius: 16px;
  background: var(--bg, #FAF9F7);
  padding: 2rem 1.5rem 1.75rem;
  text-align: center;
  box-shadow: 0 20px 50px -15px rgba(0,0,0,0.25),
              0 8px 20px -5px rgba(0,0,0,0.10),
              0 1px 0 rgba(255,255,255,0.6) inset;
}
@media (prefers-color-scheme: dark) {
  .adolf-paywall-card {
    background: var(--bg, #0F0F12);
    box-shadow: 0 20px 50px -15px rgba(0,0,0,0.7),
                0 8px 20px -5px rgba(0,0,0,0.5),
                0 1px 0 rgba(255,255,255,0.04) inset;
  }
}
.adolf-pw-heading {
  margin: 0 0 0.5rem;
  font-size: 1.5rem;
  line-height: 1.2;
  font-weight: 600;
}
.adolf-pw-lede {
  margin: 0 auto 1.5rem;
  max-width: 38ch;
  color: var(--ink-soft, #444);
  line-height: 1.55;
}
.adolf-pw-plans {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.75rem;
  margin: 0 auto 1.25rem;
  max-width: 540px;
}
@media (max-width: 640px) {
  .adolf-pw-plans { grid-template-columns: 1fr; }
}
.adolf-pw-plan {
  display: block;
  padding: 1rem 0.75rem;
  border: 1px solid var(--rule, rgba(0,0,0,0.12));
  border-radius: 10px;
  background: var(--bg, #fff);
  color: inherit;
  text-decoration: none;
  transition: border-color 160ms, transform 160ms;
}
.adolf-pw-plan:hover {
  border-color: var(--accent, #b58a3a);
  transform: translateY(-1px);
}
.adolf-pw-plan.is-recommended {
  border-color: var(--accent, #b58a3a);
  background: color-mix(in srgb, var(--accent, #b58a3a) 8%, var(--bg, #fff));
}
.adolf-pw-plan-title {
  font-weight: 600;
  font-size: 0.95rem;
  margin-bottom: 0.35rem;
}
.adolf-pw-plan-price {
  font-size: 1.4rem;
  font-weight: 700;
  letter-spacing: -0.01em;
}
.adolf-pw-plan-note {
  font-size: 0.78rem;
  color: var(--ink-soft, #666);
  margin-top: 0.35rem;
  line-height: 1.35;
}
.adolf-pw-login,
.adolf-pw-preview {
  margin: 0.25rem 0;
  font-size: 0.92rem;
  color: var(--ink-soft, #555);
  text-align: center;
}
.adolf-pw-login a,
.adolf-pw-preview a {
  color: var(--accent, #b58a3a);
  text-decoration: underline;
  text-underline-offset: 2px;
}
.adolf-pw-kicked-cta {
  margin: 1.5rem 0 0.5rem;
  font-size: 1.05rem;
}
.adolf-pw-kicked-link {
  display: inline-block;
  padding: 0.7rem 1.25rem;
  border: 1.5px solid var(--accent, #b58a3a);
  border-radius: 999px;
  color: var(--accent, #b58a3a) !important;
  text-decoration: none !important;
  font-weight: 600;
  transition: background 160ms, color 160ms;
}
.adolf-pw-kicked-link:hover {
  background: var(--accent, #b58a3a);
  color: var(--bg, #fff) !important;
}
.adolf-pw-legal {
  margin: 1.25rem auto 0;
  max-width: 42ch;
  font-size: 0.75rem;
  color: var(--ink-soft, #777);
  line-height: 1.6;
  text-align: center;
}
.adolf-pw-legal a {
  color: inherit;
  text-decoration: underline;
  white-space: nowrap;
}
</style>`;

export function paywallCard(cfg: GateConfig): string {
  const s = cfg.lang === "en" ? EN : BG;
  const langPrefix = cfg.lang === "en" ? "/en" : "/bg";

  // Kicked-out variant — the user had a valid cookie but their session
  // was superseded by another device. Don't show subscribe tiles; show
  // the kicked message + a single "get a new sign-in link" CTA.
  if (cfg.kicked) {
    return `
<aside class="adolf-paywall adolf-paywall-kicked" data-pw-server-locked="1" data-pw-reason="kicked" aria-labelledby="adolf-pw-heading">
  <div class="adolf-paywall-card">
    <h2 id="adolf-pw-heading" class="adolf-pw-heading">${escapeHtml(s.kickedHeading)}</h2>
    <p class="adolf-pw-lede">${escapeHtml(s.kickedLede)}</p>
    <p class="adolf-pw-login adolf-pw-kicked-cta">
      <a class="adolf-pw-kicked-link" href="/login?lang=${cfg.lang}">${escapeHtml(s.kickedCta)} →</a>
    </p>
    <p class="adolf-pw-legal">
      <a href="${langPrefix}/legal/terms/">${escapeHtml(s.termsLink)}</a>
      · <a href="${langPrefix}/legal/refund/">${escapeHtml(s.refundLink)}</a>
      · <a href="${langPrefix}/legal/privacy/">${escapeHtml(s.privacyLink)}</a>
    </p>
  </div>
</aside>
${SHARED_CSS}`.trim();
  }

  return `
<aside class="adolf-paywall" data-pw-server-locked="1" aria-labelledby="adolf-pw-heading">
  <div class="adolf-paywall-card">
    <h2 id="adolf-pw-heading" class="adolf-pw-heading">${escapeHtml(s.heading)}</h2>
    <p class="adolf-pw-lede">${escapeHtml(s.lede)}</p>
    <div class="adolf-pw-plans">
      <a class="adolf-pw-plan" href="/checkout?plan=3">
        <div class="adolf-pw-plan-title">${escapeHtml(s.plan3Title)}</div>
        <div class="adolf-pw-plan-price">${escapeHtml(s.plan3Price)}</div>
        <div class="adolf-pw-plan-note">${escapeHtml(s.plan3Note)}</div>
      </a>
      <a class="adolf-pw-plan is-recommended" href="/checkout?plan=6">
        <div class="adolf-pw-plan-title">${escapeHtml(s.plan6Title)}</div>
        <div class="adolf-pw-plan-price">${escapeHtml(s.plan6Price)}</div>
        <div class="adolf-pw-plan-note">${escapeHtml(s.plan6Note)}</div>
      </a>
      <a class="adolf-pw-plan" href="/checkout?plan=12">
        <div class="adolf-pw-plan-title">${escapeHtml(s.plan12Title)}</div>
        <div class="adolf-pw-plan-price">${escapeHtml(s.plan12Price)}</div>
        <div class="adolf-pw-plan-note">${escapeHtml(s.plan12Note)}</div>
      </a>
    </div>
    <p class="adolf-pw-login">
      ${escapeHtml(s.alreadySub)} <a href="/login">${escapeHtml(s.loginCta)}</a>
    </p>
    <p class="adolf-pw-preview">
      ${escapeHtml(s.preview)} <a href="${langPrefix}/${cfg.showcasePath}/">${escapeHtml(s.previewCta)}</a>
    </p>
    <p class="adolf-pw-legal">
      ${escapeHtml(s.legalNote)}<br>
      <a href="${langPrefix}/legal/terms/">${escapeHtml(s.termsLink)}</a>
      · <a href="${langPrefix}/legal/refund/">${escapeHtml(s.refundLink)}</a>
      · <a href="${langPrefix}/legal/privacy/">${escapeHtml(s.privacyLink)}</a>
    </p>
  </div>
</aside>
${SHARED_CSS}
`.trim();
}
