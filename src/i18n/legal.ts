// Legal page content (BG + EN). Lives apart from i18n/ui.ts to keep the
// UI strings module small. Each page is a structured tree the layouts
// render as <section><h2>…</h2><p>…</p></section> etc.

import type { Lang } from "./ui";

export interface LegalSection {
  heading: string;
  // Each entry is rendered as a <p>. Multiline preserved via \n.
  paragraphs: string[];
  // Optional bullet list rendered as <ul><li>.
  bullets?: string[];
}

export interface LegalPage {
  title: string;
  updated: string; // "Last updated" string
  intro?: string;
  sections: LegalSection[];
  /** Notice shown above the page body — used by Imprint while placeholders
   *  are unfilled. */
  draftNotice?: string;
}

export const legalNav = {
  bg: {
    terms: "Общи условия",
    privacy: "Поверителност",
    refund: "Право на отказ",
    imprint: "Импресум",
    lastUpdated: "Актуализация",
  },
  en: {
    terms: "Terms",
    privacy: "Privacy",
    refund: "Refund policy",
    imprint: "Imprint",
    lastUpdated: "Last updated",
  },
} as const;

// ============================================================================
// Terms & Conditions

const TERMS_BG: LegalPage = {
  title: "Общи условия",
  updated: "2026-06-09",
  intro: "Тези общи условия регулират използването на adolf.bg и абонамента за достъп до съдържание.",
  sections: [
    {
      heading: "1. Идентификация на доставчика",
      paragraphs: [
        "Доставчикът на услугата е посочен в Импресума. Контакт: noreply@adolf.bg (служебен; не за поддръжка) или адресът, посочен в Импресума.",
      ],
    },
    {
      heading: "2. Услугата",
      paragraphs: [
        "adolf.bg предоставя цифрово учебно съдържание (компендиум по ортопедия, травматология и анатомия) под формата на текстови материали и въпросни банки, достъпни през уеб браузър.",
        "Малка част от темите („showcase“) са свободно достъпни без абонамент за демонстрация. Останалите изискват активен платен абонамент.",
      ],
    },
    {
      heading: "3. Абонаментни планове",
      paragraphs: [
        "Предлагат се три плана с автоматично подновяване:",
      ],
      bullets: [
        "3 месеца — €49.99 (подновяване на всеки 3 мес.)",
        "6 месеца — €79.99 (подновяване на всеки 6 мес.)",
        "12 месеца — €99.99 (подновяване всяка година)",
      ],
    },
    {
      heading: "4. Автоматично подновяване и отказ",
      paragraphs: [
        "Абонаментът се подновява автоматично в края на всеки период чрез запазения платежен метод. Можете да го отпишете по всяко време от профила си (/portal). При отказ запазвате достъп до края на платения период; не получавате възстановяване за неизползвани дни на текущия период.",
      ],
    },
    {
      heading: "5. Право на отказ (14 дни)",
      paragraphs: [
        "Като потребител в ЕС имате право на отказ от договора в срок от 14 дни без посочване на причина. Подробности и образец на формуляр са в раздел „Право на отказ“.",
        "Тъй като услугата представлява цифрово съдържание, при изричното Ви съгласие достъпът да започне веднага, губите правото на отказ за вече консумираното съдържание. Виж страница „Право на отказ“ за пълния текст.",
      ],
    },
    {
      heading: "6. Плащания и данъци",
      paragraphs: [
        "Плащанията се обработват от Stripe. Цените са в евро и включват ДДС/VAT там, където е приложимо според Вашето местоположение. Stripe изчислява и удържа ДДС автоматично.",
      ],
    },
    {
      heading: "7. Достъпност и поддръжка",
      paragraphs: [
        "Услугата се предоставя „както е“ с разумни усилия за непрекъсваемост, но без гаранции за 100% наличност. Не претендираме съдържанието да е изчерпателно или приложимо като медицински съвет — то е учебно помагало.",
      ],
    },
    {
      heading: "8. Интелектуална собственост",
      paragraphs: [
        "Цялото съдържание е защитено с авторско право и се предоставя за лична, нетърговска употреба от абоната. Препродажба, споделяне на акаунт, или масово копиране са забранени и могат да доведат до прекратяване на абонамента без възстановяване.",
      ],
    },
    {
      heading: "9. Прекратяване",
      paragraphs: [
        "Имате право да прекратите по всяко време от профила си. Доставчикът има право да прекрати акаунти при нарушение на тези условия (вкл. споделяне на акаунт).",
      ],
    },
    {
      heading: "10. Приложимо право и спорове",
      paragraphs: [
        "Договорът се урежда от законите на държавата на доставчика, посочена в Импресума, без да се засягат императивните потребителски защити във вашата държава по местоживеене. Спорове могат да бъдат отнасяни до компетентните съдилища или чрез платформата за онлайн решаване на спорове на ЕС: https://ec.europa.eu/consumers/odr.",
      ],
    },
    {
      heading: "11. Промени",
      paragraphs: [
        "Тези условия могат да бъдат актуализирани. Промените влизат в сила за нови абонаменти веднага и за съществуващи — при следващото подновяване.",
      ],
    },
  ],
};

const TERMS_EN: LegalPage = {
  title: "Terms & Conditions",
  updated: "2026-06-09",
  intro: "These terms govern the use of adolf.bg and the subscription that grants access to content.",
  sections: [
    {
      heading: "1. Provider",
      paragraphs: [
        "The provider of the service is identified in the Imprint. Contact: noreply@adolf.bg (service mailbox, not support) or the address listed in the Imprint.",
      ],
    },
    {
      heading: "2. The service",
      paragraphs: [
        "adolf.bg provides digital study material (a compendium of orthopedics, traumatology, and anatomy) as text content and question banks, accessed via web browser.",
        "A small set of topics (the “showcase” topics) is freely accessible without a subscription. The rest require an active paid subscription.",
      ],
    },
    {
      heading: "3. Subscription plans",
      paragraphs: [
        "Three auto-renewing plans are offered:",
      ],
      bullets: [
        "3 months — €49.99 (renews every 3 months)",
        "6 months — €79.99 (renews every 6 months)",
        "12 months — €99.99 (renews yearly)",
      ],
    },
    {
      heading: "4. Auto-renewal and cancellation",
      paragraphs: [
        "The subscription renews automatically at the end of each period using your saved payment method. You may cancel at any time from your account (/portal). Cancellation keeps your access until the end of the paid period; partial-period refunds are not offered.",
      ],
    },
    {
      heading: "5. 14-day right of withdrawal",
      paragraphs: [
        "As an EU consumer, you have the right to withdraw from the contract within 14 days without giving any reason. Details and a model withdrawal form are in the “Refund policy” page.",
        "Because the service is digital content, if you explicitly consent at checkout to immediate access, you may lose the right to withdraw for content already consumed. See the Refund policy page for the full text.",
      ],
    },
    {
      heading: "6. Payments and taxes",
      paragraphs: [
        "Payments are processed by Stripe. Prices are in euros and include VAT where applicable based on your location. Stripe computes and remits VAT automatically.",
      ],
    },
    {
      heading: "7. Availability and support",
      paragraphs: [
        "The service is provided as-is with reasonable effort toward continuous availability but without uptime guarantees. Content is educational, not medical advice.",
      ],
    },
    {
      heading: "8. Intellectual property",
      paragraphs: [
        "All content is copyrighted and licensed for personal, non-commercial use by the subscriber. Resale, account sharing, and bulk copying are prohibited and may lead to termination without refund.",
      ],
    },
    {
      heading: "9. Termination",
      paragraphs: [
        "You may terminate at any time from your account. The provider may terminate accounts that breach these terms (including account sharing).",
      ],
    },
    {
      heading: "10. Governing law and disputes",
      paragraphs: [
        "The contract is governed by the laws of the provider's jurisdiction as stated in the Imprint, without prejudice to mandatory consumer protections in your country of residence. Disputes may be brought before competent courts or through the EU Online Dispute Resolution platform: https://ec.europa.eu/consumers/odr.",
      ],
    },
    {
      heading: "11. Changes",
      paragraphs: [
        "These terms may be updated. Changes apply immediately to new subscriptions and on the next renewal for existing ones.",
      ],
    },
  ],
};

// ============================================================================
// Privacy Policy

const PRIVACY_BG: LegalPage = {
  title: "Политика за поверителност",
  updated: "2026-06-09",
  intro: "Настоящата политика обяснява какви данни обработваме, на какво основание и за колко време.",
  sections: [
    {
      heading: "1. Администратор на лични данни",
      paragraphs: [
        "Администратор е лицето, посочено в Импресума. За въпроси относно личните Ви данни: noreply@adolf.bg или адресът в Импресума.",
      ],
    },
    {
      heading: "2. Какви данни събираме",
      paragraphs: [
        "Когато се абонирате: имейл адрес, име за фактуриране и адрес (обработват се от Stripe). Платежните данни се обработват директно от Stripe — ние не виждаме и не съхраняваме номера на карти.",
        "Когато използвате сайта: технически логове на ниво Cloudflare (IP, user-agent, време на заявката) с цел сигурност, ограничени във времето.",
      ],
    },
    {
      heading: "3. Основание за обработката",
      paragraphs: [
        "Изпълнение на договора (предоставяне на абонамента) — чл. 6(1)(б) GDPR. Законови задължения (счетоводно-данъчни) — чл. 6(1)(в). Защита на легитимни интереси (сигурност на сайта, борба със злоупотреби) — чл. 6(1)(е).",
      ],
    },
    {
      heading: "4. Подизпълнители",
      paragraphs: [
        "Stripe (плащания, фактуриране, ДДС) — Stripe Payments Europe Ltd (Ирландия) и Stripe Inc. (САЩ). https://stripe.com/privacy",
        "Postmark (транзакционен имейл — потвърждения, връзки за достъп) — ActiveCampaign / Postmark, САЩ. https://postmarkapp.com/privacy-policy",
        "Cloudflare (CDN, защита, Worker и Pages хостинг) — Cloudflare Inc., САЩ. https://www.cloudflare.com/privacypolicy/",
        "Прехвърлянията към доставчици в САЩ се извършват на основание EU–US Data Privacy Framework или Стандартни договорни клаузи.",
      ],
    },
    {
      heading: "5. Срокове на съхранение",
      paragraphs: [
        "Имейл и данни за абонамента: за времето на абонамента + 10 години след това (счетоводно-данъчно изискване).",
        "Магически връзки за вход: 15 минути.",
        "Auth cookies: до края на платения период.",
      ],
    },
    {
      heading: "6. Вашите права (GDPR)",
      paragraphs: [
        "Имате право на достъп, корекция, изтриване (доколкото не противоречи на счетоводните закони), ограничаване, преносимост, възражение и оплакване пред надзорен орган (например КЗЛД в България).",
      ],
    },
    {
      heading: "7. Cookies",
      paragraphs: [
        "Използваме само строго необходими cookies (за вход и сигурност). Не използваме маркетингови или аналитични cookies. Виж банера за съгласие.",
      ],
    },
  ],
};

const PRIVACY_EN: LegalPage = {
  title: "Privacy Policy",
  updated: "2026-06-09",
  intro: "This policy explains what data we process, on what basis, and how long we keep it.",
  sections: [
    {
      heading: "1. Data controller",
      paragraphs: [
        "The controller is the entity named in the Imprint. For data-protection questions: noreply@adolf.bg or the address in the Imprint.",
      ],
    },
    {
      heading: "2. Data we collect",
      paragraphs: [
        "When you subscribe: email address, billing name, and address (processed by Stripe). Card details are handled directly by Stripe — we never see or store card numbers.",
        "When you use the site: technical logs at the Cloudflare layer (IP, user-agent, request time) retained briefly for security purposes.",
      ],
    },
    {
      heading: "3. Legal bases",
      paragraphs: [
        "Performance of the contract (delivering the subscription) — Art. 6(1)(b) GDPR. Legal obligations (accounting/tax) — Art. 6(1)(c). Legitimate interests (site security, abuse prevention) — Art. 6(1)(f).",
      ],
    },
    {
      heading: "4. Sub-processors",
      paragraphs: [
        "Stripe (payments, invoicing, VAT) — Stripe Payments Europe Ltd (Ireland) and Stripe Inc. (US). https://stripe.com/privacy",
        "Postmark (transactional email — confirmations, magic links) — ActiveCampaign / Postmark, US. https://postmarkapp.com/privacy-policy",
        "Cloudflare (CDN, security, Worker and Pages hosting) — Cloudflare Inc., US. https://www.cloudflare.com/privacypolicy/",
        "Transfers to US-based processors are on the basis of the EU–US Data Privacy Framework or Standard Contractual Clauses.",
      ],
    },
    {
      heading: "5. Retention",
      paragraphs: [
        "Email and subscription data: duration of subscription + 10 years (accounting/tax requirement).",
        "Magic-link tokens: 15 minutes.",
        "Auth cookies: until the end of the paid period.",
      ],
    },
    {
      heading: "6. Your rights (GDPR)",
      paragraphs: [
        "You have rights to access, rectify, erase (subject to accounting law), restrict, port, object, and lodge a complaint with a supervisory authority (e.g. CPDP in Bulgaria).",
      ],
    },
    {
      heading: "7. Cookies",
      paragraphs: [
        "We use only strictly necessary cookies (auth and security). No marketing or analytics cookies. See the consent banner.",
      ],
    },
  ],
};

// ============================================================================
// Refund (14-day withdrawal)

const REFUND_BG: LegalPage = {
  title: "Право на отказ",
  updated: "2026-06-09",
  intro: "Информация съгласно Директива 2011/83/ЕС за правата на потребителите.",
  sections: [
    {
      heading: "1. Право на отказ в 14-дневен срок",
      paragraphs: [
        "Имате право на отказ от настоящия договор в срок от 14 дни, без да посочвате причина. Срокът тече от деня на сключване на договора.",
        "За да упражните това право, изпратете недвусмислено заявление на имейл noreply@adolf.bg или с писмо до адреса, посочен в Импресума.",
      ],
    },
    {
      heading: "2. Изключение за цифрово съдържание",
      paragraphs: [
        "Когато при поръчката давате изрично съгласие изпълнението на договора да започне веднага (т.е. незабавен достъп до съдържанието) и същевременно потвърждавате, че знаете, че ще загубите правото на отказ при пълно изпълнение, правото на отказ отпада за вече консумирано съдържание.",
        "Тъй като в момента at adolf.bg НЕ изискваме отделно такова съгласие, пълното 14-дневно право на отказ се прилага. Можете да поискате пълно възстановяване в първите 14 дни от абонамента, дори ако вече сте чели темите.",
      ],
    },
    {
      heading: "3. Последици от отказа",
      paragraphs: [
        "При отказ Ви възстановяваме всички плащания не по-късно от 14 дни след получаване на заявлението за отказ. Възстановяването се извършва по същия платежен метод, освен ако не сте се съгласили на друго; не понасяте никакви такси.",
      ],
    },
    {
      heading: "4. Образец на формуляр за отказ",
      paragraphs: [
        "До: [името на доставчика, имейл адресът, посочени в Импресума]",
        "С настоящото уведомявам/уведомяваме, че се отказвам/отказваме от сключения от мен/нас договор за предоставяне на услуга: абонамент за adolf.bg.",
        "Поръчано на: ___; Получено на: ___; Име на потребителя/ите: ___; Адрес на потребителя/ите: ___; Подпис на потребителя/ите (само ако настоящият формуляр е на хартия): ___; Дата: ___.",
      ],
    },
  ],
};

const REFUND_EN: LegalPage = {
  title: "Refund Policy",
  updated: "2026-06-09",
  intro: "Information pursuant to EU Directive 2011/83/EU on consumer rights.",
  sections: [
    {
      heading: "1. 14-day right of withdrawal",
      paragraphs: [
        "You have the right to withdraw from this contract within 14 days without giving any reason. The period runs from the day of contract conclusion.",
        "To exercise this right, send an unambiguous statement by email to noreply@adolf.bg or by letter to the address in the Imprint.",
      ],
    },
    {
      heading: "2. Digital-content exception",
      paragraphs: [
        "When at checkout you give explicit consent that performance begins immediately (i.e. immediate access to the content) and you acknowledge that you will lose the right to withdraw once performance is complete, the right of withdrawal lapses for content already consumed.",
        "Because adolf.bg does NOT currently collect such a separate consent, the full 14-day withdrawal right applies. You may request a full refund within the first 14 days of the subscription, even if you have already read topics.",
      ],
    },
    {
      heading: "3. Effects of withdrawal",
      paragraphs: [
        "On withdrawal we refund all payments within 14 days of receiving your withdrawal notice. The refund is issued via the same payment method unless you agree otherwise; no fees are charged to you.",
      ],
    },
    {
      heading: "4. Model withdrawal form",
      paragraphs: [
        "To: [provider name, email address from the Imprint]",
        "I/We hereby give notice that I/we withdraw from my/our contract of sale of the following service: adolf.bg subscription.",
        "Ordered on: ___; Received on: ___; Name of consumer(s): ___; Address of consumer(s): ___; Signature of consumer(s) (only if this form is on paper): ___; Date: ___.",
      ],
    },
  ],
};

// ============================================================================
// Imprint — placeholders to be filled tonight

const IMPRINT_BG: LegalPage = {
  title: "Импресум",
  updated: "2026-06-09",
  sections: [
    {
      heading: "Доставчик",
      paragraphs: [
        "Име: Якоб Адолф",
        "Адрес: ул. Панагюрище 38, София",
        "Държава: България",
        "Имейл за контакт: adolf@hin.ch",
        "Статут: физическо лице, не е регистрирано като търговец",
        "ДДС: не е регистриран по ДДС",
      ],
    },
    {
      heading: "Отговорност за съдържанието",
      paragraphs: [
        "Отговорен за съдържанието: Якоб Адолф",
      ],
    },
    {
      heading: "Платформа за онлайн решаване на спорове (ЕС)",
      paragraphs: [
        "Европейската комисия предоставя платформа за онлайн решаване на спорове: https://ec.europa.eu/consumers/odr",
        "Не сме длъжни и не сме готови да участваме в процедура за решаване на спорове пред арбитражна комисия за потребителите.",
      ],
    },
  ],
};

const IMPRINT_EN: LegalPage = {
  title: "Imprint",
  updated: "2026-06-09",
  sections: [
    {
      heading: "Provider",
      paragraphs: [
        "Name: Jakob Adolf",
        "Address: Panagyurishte 38, Sofia",
        "Country: Bulgaria",
        "Contact email: adolf@hin.ch",
        "Status: private individual, not registered as a sole trader",
        "VAT: not VAT-registered",
      ],
    },
    {
      heading: "Responsibility for content",
      paragraphs: [
        "Responsible for content: Jakob Adolf",
      ],
    },
    {
      heading: "EU Online Dispute Resolution",
      paragraphs: [
        "The European Commission provides a platform for online dispute resolution: https://ec.europa.eu/consumers/odr",
        "We are not obligated nor willing to participate in a dispute settlement procedure before a consumer arbitration board.",
      ],
    },
  ],
};

// ============================================================================
// Export tables

export const legalPages: Record<Lang, {
  terms: LegalPage; privacy: LegalPage; refund: LegalPage; imprint: LegalPage;
}> = {
  bg: { terms: TERMS_BG, privacy: PRIVACY_BG, refund: REFUND_BG, imprint: IMPRINT_BG },
  en: { terms: TERMS_EN, privacy: PRIVACY_EN, refund: REFUND_EN, imprint: IMPRINT_EN },
};
