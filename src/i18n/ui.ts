export const LANGS = ["bg", "en"] as const;
export type Lang = (typeof LANGS)[number];

export const DEFAULT_LANG: Lang = "bg";

type UIStrings = {
  siteTitle: string;
  siteTagline: string;
  sectionOrtho: string;
  sectionTrauma: string;
  sectionAnatomy: string;
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
  sectionQBank: string;
  testYourself: string;
  qbankIntroTitle: string;
  qbankIntroBody: string;
  topicIntroTitle: (n: number) => string;
  topicIntroBody: string;
  startQuiz: string;
  question: string;
  outOf: string;
  nextQuestion: string;
  showScore: string;
  yourScore: string;
  tryAgain: string;
  backToTopic: string;
  loading: string;
};

export const ui: Record<Lang, UIStrings> = {
  bg: {
    siteTitle: "adolf.bg",
    siteTagline: "Ортопедия и травматология: компендиум за държавния изпит",
    sectionOrtho: "Ортопедия",
    sectionTrauma: "Травматология",
    sectionAnatomy: "Анатомия",
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
    sectionQBank: "Въпросник",
    testYourself: "Тествай се",
    qbankIntroTitle: "Въпросник",
    qbankIntroBody:
      "20 случайно подбрани въпроса от 7400, от всички теми по ортопедия, травматология и анатомия.",
    topicIntroTitle: (n) => `Тест по тема ${n}`,
    topicIntroBody:
      "20 случайно подбрани въпроса от 100 за тази тема. Без точки за грешен опит; натисни „Следващ“ за следващия въпрос.",
    startQuiz: "Започни",
    question: "Въпрос",
    outOf: "от",
    nextQuestion: "Следващ въпрос",
    showScore: "Виж резултата",
    yourScore: "Резултат",
    tryAgain: "Опитай отново",
    backToTopic: "Към темата",
    loading: "Зарежда…",
  },
  en: {
    siteTitle: "adolf.bg",
    siteTagline: "Orthopedics & Traumatology: State Board Exam Compendium",
    sectionOrtho: "Orthopedics",
    sectionTrauma: "Traumatology",
    sectionAnatomy: "Anatomy",
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
    sectionQBank: "Q-Bank",
    testYourself: "Test yourself",
    qbankIntroTitle: "Q-Bank",
    qbankIntroBody:
      "20 random questions drawn from 7400, across all orthopedics, traumatology, and anatomy topics.",
    topicIntroTitle: (n) => `Topic ${n} Quiz`,
    topicIntroBody:
      "20 random questions drawn from 100 for this topic. No penalty for a wrong guess; press “Next” to continue.",
    startQuiz: "Start",
    question: "Question",
    outOf: "of",
    nextQuestion: "Next question",
    showScore: "Show score",
    yourScore: "Your score",
    tryAgain: "Try again",
    backToTopic: "Back to topic",
    loading: "Loading…",
  },
};

export function otherLang(l: Lang): Lang {
  return l === "bg" ? "en" : "bg";
}
