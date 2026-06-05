export const LANGS = ["bg", "en"] as const;
export type Lang = (typeof LANGS)[number];

export const DEFAULT_LANG: Lang = "bg";

type UIStrings = {
  siteTitle: string;
  siteTagline: string;
  sectionOrtho: string;
  sectionTrauma: string;
  preface: string;
  topic: string;
  search: string;
  searchPlaceholder: string;
  langName: string;
  switchTo: Record<Lang, string>;
  home: string;
  contents: string;
  prev: string;
  next: string;
  openMenu: string;
  closeMenu: string;
  dark: string;
  light: string;
  topicNumberLabel: (n: number) => string;
};

export const ui: Record<Lang, UIStrings> = {
  bg: {
    siteTitle: "adolf.bg",
    siteTagline: "Ортопедия и травматология — компендиум за държавния изпит",
    sectionOrtho: "Ортопедия",
    sectionTrauma: "Травматология",
    preface: "Предговор",
    topic: "Тема",
    search: "Търсене",
    searchPlaceholder: "Търсене в теми…",
    langName: "Български",
    switchTo: { en: "English", bg: "Български" },
    home: "Начало",
    contents: "Съдържание",
    prev: "Предишна",
    next: "Следваща",
    openMenu: "Отвори менюто",
    closeMenu: "Затвори менюто",
    dark: "Тъмно",
    light: "Светло",
    topicNumberLabel: (n) => `Тема ${n}`,
  },
  en: {
    siteTitle: "adolf.bg",
    siteTagline: "Orthopedics & Traumatology — State Board Exam Compendium",
    sectionOrtho: "Orthopedics",
    sectionTrauma: "Traumatology",
    preface: "Preface",
    topic: "Topic",
    search: "Search",
    searchPlaceholder: "Search topics…",
    langName: "English",
    switchTo: { en: "English", bg: "Български" },
    home: "Home",
    contents: "Contents",
    prev: "Previous",
    next: "Next",
    openMenu: "Open menu",
    closeMenu: "Close menu",
    dark: "Dark",
    light: "Light",
    topicNumberLabel: (n) => `Topic ${n}`,
  },
};

export function otherLang(l: Lang): Lang {
  return l === "bg" ? "en" : "bg";
}
