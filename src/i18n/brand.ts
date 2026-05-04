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
 * アプリ独自の SEO 補強用 variants。LP_BRAND_VARIANTS と分離して持ち、
 * JSON-LD alternateName 構築時に両方 flatten する。
 *
 * ja の場合: 商品名の正式読みが「フタトキトケイ」(連濁なし) か「フタトキドケイ」
 * (連濁あり、腹時計 / 目覚まし時計 / 鳩時計 の慣習) かまだ定まり切っていないため、
 * カナ (フタトキ / ふたとき / Futatoki) × 時計表記 (とけい / どけい) の組合せで
 * 表記揺れを全網羅する。これにより Google は「フタトキ時計 / Futatoki the Clock /
 * フタトキとけい / ふたどけい」等を同一 entity として cluster できる。
 *
 * Schema.org alternateName は entity の表記揺れ全部入れるのが本来用途で、
 * 商品名 variants の網羅は spam 判定にはならない。
 */
export const APP_EXTRA_VARIANTS: Record<string, readonly string[]> = {
  ja: [
    "Futatoki時計",
    "フタトキとけい",
    "ふたときとけい",
    "Futatokiとけい",
    "フタトキどけい",
    "ふたときどけい",
    "Futatokiどけい",
  ],
};

/**
 * LP HomePage.astro の BRAND_VARIANTS と概ね同期。JSON-LD alternateName で
 * 全 locale variants を flatten して使う。
 *
 * 例外: ja の短縮単独「ふたとき」は alternateName 配列から外す (Google が
 * 「ふたとき = 二刻」の文脈不明なクエリにブランドを出す副作用を避けるため、
 * 短縮形はカタカナ「フタトキ」と Latin「Futatoki」だけに絞る)。LP 側は
 * 別途追従修正する。
 */
export const LP_BRAND_VARIANTS: Record<string, readonly string[]> = {
  ja: ["フタトキ時計", "ふたとき時計", "フタトキ"],
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
