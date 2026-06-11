// Legal page content (BG + EN). Each page is a structured tree the layouts
// render as <section><h2>…</h2><p>…</p></section> etc.

import type { Lang } from "./ui";

export interface LegalSection {
  heading: string;
  paragraphs: string[];
  bullets?: string[];
}

export interface LegalPage {
  title: string;
  updated: string; // "Last updated" string
  intro?: string;
  sections: LegalSection[];
  draftNotice?: string;
}

export const legalNav = {
  bg: {
    terms: "Общи условия",
    privacy: "Поверителност",
    imprint: "Импресум",
    lastUpdated: "Актуализация",
  },
  en: {
    terms: "Terms",
    privacy: "Privacy",
    imprint: "Imprint",
    lastUpdated: "Last updated",
  },
} as const;

// ============================================================================
// Terms of use

const TERMS_BG: LegalPage = {
  title: "Общи условия",
  updated: "2026-06-10",
  intro: "Тези условия регулират използването на adolf.bg — отворен учебен ресурс по ортопедия, травматология и хирургична анатомия за подготовка за държавния изпит.",
  sections: [
    {
      heading: "1. За проекта",
      paragraphs: [
        "adolf.bg е безплатно достъпен учебен сайт. Не се изисква регистрация, абонамент или плащане за достъп до съдържанието.",
        "Съдържанието е създадено от д-р Якоб Адолф като част от изследователската група на проф. Николай Димитров в Университетска болница по ортопедия „Горна баня“, София.",
        "За въпроси, корекции или съдържателен принос: contact@dimitrov-group.eu",
      ],
    },
    {
      heading: "2. Употреба",
      paragraphs: [
        "Съдържанието е учебно помагало за подготовка за държавния изпит и не представлява медицински съвет. Не носим отговорност за решения, взети въз основа на материалите.",
        "Свободно е за лична образователна употреба. Препечатване, превод или повторно публикуване с цел разпространение изисква разрешение от изследователската група.",
      ],
    },
    {
      heading: "3. Авторско право",
      paragraphs: [
        "Текстовете са обобщения от 14 справочни издания. Оригиналните авторски права принадлежат на съответните автори и издатели. Сайтът представя свободно достъпно резюме за образователни цели.",
      ],
    },
    {
      heading: "4. Без гаранции",
      paragraphs: [
        "Услугата се предоставя „както е“. Полагаме усилия за точност, но не гарантираме изчерпателност или липса на грешки. Виждате нещо неточно? Пишете ни на contact@dimitrov-group.eu.",
      ],
    },
    {
      heading: "5. Приложимо право",
      paragraphs: [
        "Условията се уреждат от законодателството на държавата на доставчика, посочена в Импресума.",
      ],
    },
  ],
};

const TERMS_EN: LegalPage = {
  title: "Terms of Use",
  updated: "2026-06-10",
  intro: "These terms govern the use of adolf.bg — an open educational resource on orthopaedics, traumatology, and surgical anatomy for the Bulgarian state board exam.",
  sections: [
    {
      heading: "1. About the project",
      paragraphs: [
        "adolf.bg is a freely accessible educational website. No registration, subscription, or payment is required to access the content.",
        "The content was created by Dr Jakob Adolf as part of Professor Nikolay Dimitrov's research group at the University Hospital for Orthopaedics \"Gorna Banya\", Sofia.",
        "For questions, corrections, or content contributions: contact@dimitrov-group.eu",
      ],
    },
    {
      heading: "2. Use",
      paragraphs: [
        "The content is a study aid for preparation for the state board exam and does not constitute medical advice. We accept no liability for decisions made on the basis of the materials.",
        "Free for personal educational use. Reprinting, translation, or republication for redistribution requires permission from the research group.",
      ],
    },
    {
      heading: "3. Copyright",
      paragraphs: [
        "The texts are syntheses from 14 reference editions. Original copyrights belong to the respective authors and publishers. The site presents a freely accessible summary for educational purposes.",
      ],
    },
    {
      heading: "4. No warranties",
      paragraphs: [
        "The service is provided \"as is\". We aim for accuracy but make no guarantee of completeness or freedom from errors. Spotted something inaccurate? Email contact@dimitrov-group.eu.",
      ],
    },
    {
      heading: "5. Governing law",
      paragraphs: [
        "These terms are governed by the law of the provider's country listed in the Imprint.",
      ],
    },
  ],
};

// ============================================================================
// Privacy policy

const PRIVACY_BG: LegalPage = {
  title: "Политика за поверителност",
  updated: "2026-06-10",
  intro: "Кратко резюме: adolf.bg не събира лични данни, не използва аналитика и не задава cookies. Можете да четете напълно анонимно.",
  sections: [
    {
      heading: "1. Какво не правим",
      paragraphs: [
        "Не изискваме регистрация. Не съхраняваме акаунти, имейл адреси или потребителски профили.",
        "Не използваме Google Analytics, Meta Pixel или подобни инструменти за проследяване. Не виждаме кои сте.",
        "Не задаваме cookies за реклама или маркетинг.",
      ],
    },
    {
      heading: "2. Какво се случва технически",
      paragraphs: [
        "Сайтът се хоства през Cloudflare и GitHub Pages. Тези доставчици могат да обработват стандартни server logs (IP адрес, time-stamp, заявен ресурс) за целите на сигурността и доставката на съдържание. Тези логове не са свързани с лични данни от наша страна.",
        "Браузърът Ви запазва малки технически препоръчителни предпочитания (тема светъл/тъмен, избран език) в localStorage — те остават на вашето устройство и не се изпращат до нас.",
      ],
    },
    {
      heading: "3. Контакт",
      paragraphs: [
        "Ако ни пишете на contact@dimitrov-group.eu, ще използваме адреса само за да отговорим. Не го добавяме към никаква маркетингова листа.",
      ],
    },
    {
      heading: "4. Вашите права",
      paragraphs: [
        "Тъй като не съхраняваме лични данни, искания за достъп, корекция или изтриване нямат предмет. Винаги можете да изпратите запитване на адреса по-горе.",
      ],
    },
  ],
};

const PRIVACY_EN: LegalPage = {
  title: "Privacy Policy",
  updated: "2026-06-10",
  intro: "Short summary: adolf.bg does not collect personal data, does not use analytics, and does not set tracking cookies. You can read entirely anonymously.",
  sections: [
    {
      heading: "1. What we don't do",
      paragraphs: [
        "We don't require registration. We don't store accounts, email addresses, or user profiles.",
        "We don't use Google Analytics, Meta Pixel, or similar tracking tools. We don't know who you are.",
        "We don't set advertising or marketing cookies.",
      ],
    },
    {
      heading: "2. What happens technically",
      paragraphs: [
        "The site is hosted via Cloudflare and GitHub Pages. These providers may process standard server logs (IP address, time-stamp, requested resource) for security and content-delivery purposes. We don't link these logs to personal data on our side.",
        "Your browser stores small technical preferences (light/dark theme, chosen language) in localStorage — they stay on your device and are not sent to us.",
      ],
    },
    {
      heading: "3. Contact",
      paragraphs: [
        "If you write to us at contact@dimitrov-group.eu, we use the address only to reply. We do not add you to any marketing list.",
      ],
    },
    {
      heading: "4. Your rights",
      paragraphs: [
        "Because we do not store personal data, requests for access, correction, or deletion have no subject matter. You can always send a query to the address above.",
      ],
    },
  ],
};

// ============================================================================
// Imprint

const IMPRINT_BG: LegalPage = {
  title: "Импресум",
  updated: "2026-06-10",
  sections: [
    {
      heading: "Автор на съдържанието",
      paragraphs: [
        "Д-р Якоб Адолф",
        "Част от изследователската група на проф. Николай Димитров",
        "Университетска болница по ортопедия „Горна баня“",
        "София, България",
      ],
    },
    {
      heading: "Контакт",
      paragraphs: [
        "Имейл: contact@dimitrov-group.eu",
        "Изследователска група: https://dimitrov-group.eu",
      ],
    },
    {
      heading: "Отговорност за съдържанието",
      paragraphs: [
        "Отговорен за съдържанието: д-р Якоб Адолф, в рамките на изследователската група.",
      ],
    },
  ],
};

const IMPRINT_EN: LegalPage = {
  title: "Imprint",
  updated: "2026-06-10",
  sections: [
    {
      heading: "Content author",
      paragraphs: [
        "Dr Jakob Adolf",
        "Part of Prof. Nikolay Dimitrov's research group",
        "University Hospital for Orthopaedics \"Gorna Banya\"",
        "Sofia, Bulgaria",
      ],
    },
    {
      heading: "Contact",
      paragraphs: [
        "Email: contact@dimitrov-group.eu",
        "Research group: https://dimitrov-group.eu",
      ],
    },
    {
      heading: "Responsibility for content",
      paragraphs: [
        "Responsible for content: Dr Jakob Adolf, within the research group.",
      ],
    },
  ],
};

// ============================================================================
// Export tables

export const legalPages: Record<Lang, {
  terms: LegalPage; privacy: LegalPage; imprint: LegalPage;
}> = {
  bg: { terms: TERMS_BG, privacy: PRIVACY_BG, imprint: IMPRINT_BG },
  en: { terms: TERMS_EN, privacy: PRIVACY_EN, imprint: IMPRINT_EN },
};
