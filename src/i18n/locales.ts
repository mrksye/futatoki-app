export type LocaleDir = "ltr" | "rtl";

export type LocaleMeta = {
  /** BCP 47 tag */
  code: string;
  /** English name */
  name: string;
  /** Self-referential name in native script */
  endonym: string;
  dir: LocaleDir;
};

export const SUPPORTED_LOCALES: readonly LocaleMeta[] = [
  { code: "en",    name: "English",              endonym: "English",            dir: "ltr" },
  { code: "ja",    name: "Japanese",             endonym: "日本語",              dir: "ltr" },
  { code: "es",    name: "Spanish",              endonym: "Español",            dir: "ltr" },
  { code: "fr",    name: "French",               endonym: "Français",           dir: "ltr" },
  { code: "de",    name: "German",               endonym: "Deutsch",            dir: "ltr" },
  { code: "pt-BR", name: "Portuguese (Brazil)",  endonym: "Português (Brasil)", dir: "ltr" },
  { code: "zh-CN", name: "Chinese (Simplified)", endonym: "简体中文",            dir: "ltr" },
  { code: "zh-TW", name: "Chinese (Traditional)",endonym: "繁體中文",            dir: "ltr" },
  { code: "ko",    name: "Korean",               endonym: "한국어",              dir: "ltr" },
  { code: "ru",    name: "Russian",              endonym: "Русский",            dir: "ltr" },
  { code: "pl",    name: "Polish",               endonym: "Polski",             dir: "ltr" },
  { code: "tr",    name: "Turkish",              endonym: "Türkçe",             dir: "ltr" },
  { code: "th",    name: "Thai",                 endonym: "ไทย",                 dir: "ltr" },
  { code: "ar",    name: "Arabic",               endonym: "العربية",             dir: "rtl" },
  { code: "fa",    name: "Persian",              endonym: "فارسی",               dir: "rtl" },
  { code: "ur",    name: "Urdu",                 endonym: "اردو",                dir: "rtl" },
  { code: "hi",    name: "Hindi",                endonym: "हिन्दी",                dir: "ltr" },
  { code: "bn",    name: "Bengali",              endonym: "বাংলা",               dir: "ltr" },
  { code: "ta",    name: "Tamil",                endonym: "தமிழ்",                dir: "ltr" },
  { code: "id",    name: "Indonesian",           endonym: "Bahasa Indonesia",   dir: "ltr" },
] as const;

/** 端末も URL も指定が無い / 未対応言語のときのデフォルト。
 *  source (ja) ではなく en にしているのは、未対応言語 browser の user に
 *  日本語を見せるより英語の方が圧倒的に通じるため。
 *  この時だけ en chunk が dynamic fetch される（その user だけのコスト）。 */
export const DEFAULT_LOCALE = "en";

/** 翻訳の source of truth。この言語の JSON がマスター */
export const SOURCE_LOCALE = "ja";
