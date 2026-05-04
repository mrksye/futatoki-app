/**
 * ブランド表記ルール。LP (futatoki.app) と play.futatoki.app の二層構造。
 *
 * - LP_BRAND: LP 側で使うブランド本体表記。manifest.name / description 内引用 /
 *   JSON-LD alternateName 用。アプリ側の og:site_name / <title> には使わない。
 * - APP_BRAND: アプリ版表記。og:site_name / <title> 内で LP 本体と差別化し
 *   「アプリ版」ポジションを保つ。
 *
 * 全 20 locale 揃え。app 訳語は LP の各 locale MDX (src/content/home/{locale}.mdx
 * の ctaOpenApp / 本文の app 相当語) に合わせて選定。
 */

export const LP_BRAND: Record<string, string> = {
  ja: "フタトキ時計",
  en: "Futatoki the Clock",
  "zh-CN": "Futatoki 一双时钟",
  "zh-TW": "Futatoki 一雙時鐘",
  ko: "Futatoki 시계",
  es: "Futatoki Reloj",
  fr: "Futatoki Horloge",
  de: "Futatoki Uhr",
  "pt-BR": "Futatoki Relógio",
  ru: "Futatoki Часы",
  ar: "Futatoki ساعة",
  hi: "Futatoki घड़ी",
  id: "Futatoki Jam",
  th: "Futatoki นาฬิกา",
  tr: "Futatoki Saat",
  pl: "Futatoki Zegar",
  fa: "Futatoki ساعت",
  ur: "Futatoki گھڑی",
  bn: "Futatoki ঘড়ি",
  ta: "Futatoki கடிகாரம்",
};

export const APP_BRAND: Record<string, string> = {
  ja: "フタトキアプリ",
  en: "Futatoki App",
  "zh-CN": "Futatoki 应用",
  "zh-TW": "Futatoki App",
  ko: "Futatoki 앱",
  es: "Futatoki App",
  fr: "Futatoki App",
  de: "Futatoki App",
  "pt-BR": "Futatoki App",
  ru: "Futatoki Приложение",
  ar: "Futatoki تطبيق",
  hi: "Futatoki ऐप",
  id: "Futatoki App",
  th: "Futatoki แอป",
  tr: "Futatoki Uygulama",
  pl: "Futatoki Aplikacja",
  fa: "Futatoki برنامه",
  ur: "Futatoki ایپ",
  bn: "Futatoki অ্যাপ",
  ta: "Futatoki செயலி",
};

/**
 * iOS Safari ホーム画面追加時のラベル。ja のみカナ短縮、他は全 locale で
 * "Futatoki" Latin (固有名詞) 統一。LP の各 locale でも本文中の固有名は
 * Futatoki Latin 表記なので整合する。
 */
export const APPLE_TITLE: Record<string, string> = {
  ja: "フタトキ",
};

/** og:locale (Open Graph 形式 = BCP47 を underscore + 大文字 region に)。 */
export const OG_LOCALE: Record<string, string> = {
  ja: "ja_JP",
  en: "en_US",
  "zh-CN": "zh_CN",
  "zh-TW": "zh_TW",
  ko: "ko_KR",
  es: "es_ES",
  fr: "fr_FR",
  de: "de_DE",
  "pt-BR": "pt_BR",
  ru: "ru_RU",
  ar: "ar_AR",
  hi: "hi_IN",
  id: "id_ID",
  th: "th_TH",
  tr: "tr_TR",
  pl: "pl_PL",
  fa: "fa_IR",
  ur: "ur_PK",
  bn: "bn_BD",
  ta: "ta_IN",
};

/**
 * LP HomePage.astro の BRAND_VARIANTS と同じ構造。JSON-LD alternateName で
 * 全 locale variants を flatten して使う。アプリの SEO 整合のため LP 全
 * 表記をそのまま参照する。
 */
export const LP_BRAND_VARIANTS: Record<string, readonly string[]> = {
  ja: ["フタトキ時計", "ふたとき時計", "フタトキ", "ふたとき"],
  en: ["Futatoki the Clock"],
  "zh-CN": ["Futatoki 一双时钟"],
  "zh-TW": ["Futatoki 一雙時鐘"],
  ko: ["Futatoki 시계"],
  es: ["Futatoki Reloj"],
  fr: ["Futatoki Horloge"],
  de: ["Futatoki Uhr"],
  "pt-BR": ["Futatoki Relógio"],
  ru: ["Futatoki Часы"],
  ar: ["Futatoki ساعة"],
  hi: ["Futatoki घड़ी"],
  id: ["Futatoki Jam"],
  th: ["Futatoki นาฬิกา"],
  tr: ["Futatoki Saat"],
  pl: ["Futatoki Zegar"],
  fa: ["Futatoki ساعت"],
  ur: ["Futatoki گھڑی"],
  bn: ["Futatoki ঘড়ি"],
  ta: ["Futatoki கடிகாரம்"],
};
