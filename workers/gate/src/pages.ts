// Standalone Worker-served HTML pages: /login, /welcome, errors.
//
// Kept intentionally simple — these don't go through the Astro site so
// they need their own minimal styling. They share the site's color
// language via :root vars so dark mode etc. still works on the live site
// once mounted at the same origin.

const COMMON_HEAD = `
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
  <meta name="robots" content="noindex,nofollow">
  <style>
    :root { color-scheme: light dark;
      --bg: #FAF9F7; --ink: #14110F; --ink-soft: #5b524b;
      --rule: rgba(0,0,0,0.12); --accent: #b58a3a;
    }
    @media (prefers-color-scheme: dark) {
      :root { --bg: #0F0F12; --ink: #ECEAE6; --ink-soft: #9b938b;
        --rule: rgba(255,255,255,0.12);
      }
    }
    body {
      margin: 0; padding: 0;
      background: var(--bg); color: var(--ink);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      line-height: 1.55;
    }
    .shell { max-width: 480px; margin: 0 auto; padding: 4rem 1.25rem 2rem; }
    h1 { font-size: 1.75rem; margin: 0 0 0.5rem; }
    p { color: var(--ink-soft); margin: 0 0 1rem; }
    a { color: var(--accent); }
    .card {
      border: 1px solid var(--rule); border-radius: 12px;
      padding: 1.5rem; background: var(--bg);
    }
    form { display: grid; gap: 0.75rem; }
    label { font-weight: 600; font-size: 0.9rem; }
    input[type=email] {
      font: inherit; padding: 0.65rem 0.75rem; border-radius: 8px;
      border: 1px solid var(--rule); background: transparent; color: inherit;
    }
    button {
      font: inherit; font-weight: 600; padding: 0.7rem 1rem; border-radius: 8px;
      border: 0; background: var(--ink); color: var(--bg); cursor: pointer;
    }
    .muted { font-size: 0.85rem; color: var(--ink-soft); }
    .single-device-note { margin: -0.25rem 0 0.25rem; line-height: 1.4; }
    .home-link { display: inline-block; margin-top: 1.25rem; }
  </style>
`;

interface S {
  loginTitle: string; loginLede: string; emailLabel: string; submit: string;
  /** Note about single-device enforcement shown under the login input. */
  singleDeviceNote: string;
  checkTitle: string; checkLede: string;
  welcomeTitle: string; welcomeLede: string; toLogin: string;
  errMissing: string; errInvalid: string; backHome: string;
}

const BG: S = {
  loginTitle: "Вход",
  loginLede: "Въведете email-а на вашия абонамент. Ще получите връзка за достъп.",
  emailLabel: "Email",
  submit: "Изпрати връзката",
  singleDeviceNote: "Един активен достъп на абонамент. Вход тук ще излезе от другите ви устройства.",
  checkTitle: "Проверете пощата",
  checkLede: "Изпратихме връзка за достъп, ако имате активен абонамент с този email. Връзката изтича след 15 минути.",
  welcomeTitle: "Благодарим!",
  welcomeLede: "Абонаментът ви е активен. На посочения email ще получите потвърждение. Можете да влезете по всяко време чрез връзка по email.",
  toLogin: "Вход",
  errMissing: "Липсва токен.",
  errInvalid: "Връзката е изтекла или невалидна. Можете да поискате нова.",
  backHome: "Към началото",
};

const EN: S = {
  loginTitle: "Sign in",
  loginLede: "Enter the email on your subscription. We'll send you an access link.",
  emailLabel: "Email",
  submit: "Send link",
  singleDeviceNote: "One active session per subscription. Signing in here will sign out your other devices.",
  checkTitle: "Check your email",
  checkLede: "If you have an active subscription with this email, we've sent a link. It expires in 15 minutes.",
  welcomeTitle: "Thanks!",
  welcomeLede: "Your subscription is active. We've emailed a confirmation. You can sign in any time via email.",
  toLogin: "Sign in",
  errMissing: "Token missing.",
  errInvalid: "Link expired or invalid. Request a new one.",
  backHome: "Back home",
};

function pick(lang: "bg" | "en"): S { return lang === "en" ? EN : BG; }

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

export function loginFormPage(lang: "bg" | "en"): string {
  const s = pick(lang);
  return `<!doctype html>
<html lang="${lang}"><head>
  <title>${escapeHtml(s.loginTitle)} · adolf.bg</title>
  ${COMMON_HEAD}
</head><body>
  <main class="shell">
    <h1>${escapeHtml(s.loginTitle)}</h1>
    <p>${escapeHtml(s.loginLede)}</p>
    <div class="card">
      <form method="POST" action="/login?lang=${lang}">
        <label for="email">${escapeHtml(s.emailLabel)}</label>
        <input id="email" name="email" type="email" required autocomplete="email" autofocus>
        <p class="muted single-device-note">${escapeHtml(s.singleDeviceNote)}</p>
        <button type="submit">${escapeHtml(s.submit)}</button>
      </form>
    </div>
    <a class="home-link" href="/${lang}/">${escapeHtml(s.backHome)} →</a>
  </main>
</body></html>`;
}

export function checkEmailPage(lang: "bg" | "en"): string {
  const s = pick(lang);
  return `<!doctype html>
<html lang="${lang}"><head>
  <title>${escapeHtml(s.checkTitle)} · adolf.bg</title>
  ${COMMON_HEAD}
</head><body>
  <main class="shell">
    <h1>${escapeHtml(s.checkTitle)}</h1>
    <p>${escapeHtml(s.checkLede)}</p>
    <a class="home-link" href="/${lang}/">${escapeHtml(s.backHome)} →</a>
  </main>
</body></html>`;
}

export function welcomePage(lang: "bg" | "en", publicOrigin: string): string {
  const s = pick(lang);
  return `<!doctype html>
<html lang="${lang}"><head>
  <title>${escapeHtml(s.welcomeTitle)} · adolf.bg</title>
  ${COMMON_HEAD}
</head><body>
  <main class="shell">
    <h1>${escapeHtml(s.welcomeTitle)}</h1>
    <p>${escapeHtml(s.welcomeLede)}</p>
    <p><a href="${publicOrigin}/login?lang=${lang}">${escapeHtml(s.toLogin)} →</a></p>
    <a class="home-link" href="/${lang}/">${escapeHtml(s.backHome)} →</a>
  </main>
</body></html>`;
}

export function errorPage(lang: "bg" | "en", kind: "missing-token" | "invalid-or-expired"): string {
  const s = pick(lang);
  const msg = kind === "missing-token" ? s.errMissing : s.errInvalid;
  return `<!doctype html>
<html lang="${lang}"><head>
  <title>Error · adolf.bg</title>
  ${COMMON_HEAD}
</head><body>
  <main class="shell">
    <h1>${escapeHtml(msg)}</h1>
    <p><a href="/login?lang=${lang}">${escapeHtml(s.toLogin)} →</a></p>
    <a class="home-link" href="/${lang}/">${escapeHtml(s.backHome)} →</a>
  </main>
</body></html>`;
}
