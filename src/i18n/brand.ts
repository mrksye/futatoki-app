/**
 * ブランド表記ルール。Thomas the Tank Engine モデル (正式 / 愛称 / 短縮) に
 * 加えて、当アプリ独自の「アプリ版」軸が乗る 4 階層構造。
 *
 * - OFFICIAL_BRAND: 正式名称 (Futatoki the Learning Clock / 知育時計ふたときアプリ
 *   など)。JSON-LD `name` / manifest.name / NOTICE などの primary brand 用。
 * - LP_BRAND: 愛称 (Futatoki the Clock / ふたとき時計 など)。説明文の二回目以降、
 *   LP 本体の Home/Privacy で使われる「親しみ表記」。
 * - APP_BRAND: アプリ版表記 (Futatoki App / ふたときアプリ など)。og:site_name
 *   や <title> で「LP 本体ではなくアプリ版」を示す軸。
 * - APPLE_TITLE: iOS ホーム画面短縮 (Futatoki / ふたとき)。
 *
 * 全 20 locale 揃え。LP に翻訳のある 7 locale (en/ja/zh-CN/zh-TW/pt-BR/hi/bn)
 * の正式名称は LP の src/content/guide/{locale}.mdx の appName と同期。残る 13
 * locale は各文化圏の教育語彙 (Educational / 学習 / Lern など) を選定。
 */

export const OFFICIAL_BRAND: Record<string, string> = {
  ja: "知育時計ふたときアプリ",
  en: "Futatoki the Learning Clock",
  "zh-CN": "Futatoki 教学时钟",
  "zh-TW": "Futatoki 教學時鐘",
  ko: "Futatoki 학습 시계",
  es: "Futatoki Reloj Educativo",
  fr: "Futatoki Horloge Éducative",
  de: "Futatoki Lernuhr",
  it: "Futatoki Orologio Didattico",
  "pt-BR": "Futatoki Relógio Educativo",
  ru: "Futatoki Обучающие Часы",
  ar: "Futatoki ساعة تعليمية",
  hi: "Futatoki शैक्षिक घड़ी",
  id: "Futatoki Jam Belajar",
  th: "Futatoki นาฬิกาเรียนรู้",
  tr: "Futatoki Öğrenme Saati",
  pl: "Futatoki Zegar do Nauki",
  fa: "Futatoki ساعت آموزشی",
  ur: "Futatoki تعلیمی گھڑی",
  bn: "Futatoki শিক্ষামূলক ঘড়ি",
};

export const LP_BRAND: Record<string, string> = {
  ja: "ふたとき時計",
  en: "Futatoki the Clock",
  "zh-CN": "Futatoki 双面时钟",
  "zh-TW": "Futatoki 雙面時鐘",
  ko: "Futatoki 시계",
  es: "Futatoki Reloj",
  fr: "Futatoki Horloge",
  de: "Futatoki Uhr",
  it: "Futatoki Orologio",
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
};

export const APP_BRAND: Record<string, string> = {
  ja: "ふたときアプリ",
  en: "Futatoki App",
  "zh-CN": "Futatoki 应用",
  "zh-TW": "Futatoki App",
  ko: "Futatoki 앱",
  es: "Futatoki App",
  fr: "Futatoki App",
  de: "Futatoki App",
  it: "Futatoki App",
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
};

/**
 * iOS Safari ホーム画面追加時のラベル。ja のみカナ短縮、他は全 locale で
 * "Futatoki" Latin (固有名詞) 統一。LP の各 locale でも本文中の固有名は
 * Futatoki Latin 表記なので整合する。
 */
export const APPLE_TITLE: Record<string, string> = {
  ja: "ふたとき",
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
  it: "it_IT",
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
};

/**
 * アプリ独自の SEO 補強用 variants。BRAND_ALIASES と分離して持ち、
 * JSON-LD alternateName 構築時に両方 flatten する。
 *
 * ja の場合: 商品名の正式読みが「ふたときとけい」(連濁なし) か「ふたときどけい」
 * (連濁あり、腹時計 / 目覚まし時計 / 鳩時計 の慣習) かまだ定まり切っていないため、
 * カナ (ふたとき / フタトキ / Futatoki) × 時計表記 (とけい / どけい) の組合せで
 * 表記揺れを全網羅する。これにより Google は「ふたとき時計 / Futatoki the Clock /
 * ふたときとけい / ふたときどけい」等を同一 entity として cluster できる。
 *
 * Schema.org alternateName は entity の表記揺れ全部入れるのが本来用途で、
 * 商品名 variants の網羅は spam 判定にはならない。
 */
export const APP_EXTRA_VARIANTS: Record<string, readonly string[]> = {
  ja: [
    "Futatoki時計",
    "ふたときとけい",
    "フタトキとけい",
    "Futatokiとけい",
    "ふたときどけい",
    "フタトキどけい",
    "Futatokiどけい",
  ],
};

/**
 * SEO entity cluster 用の表記揺れ集約。各 locale の正式 / 愛称 / アプリ版 /
 * 短縮 / 旧表記を全部入れる。JSON-LD alternateName で全 locale 分を flatten
 * し、当該 entity の primary name (= OFFICIAL_BRAND[locale]) と重複したもの
 * だけ自動除外して出力する。
 *
 * 短縮単独はひらがな「ふたとき」と Latin「Futatoki」に絞り、旧カタカナ短縮
 * 「フタトキ」は含めない。旧カタカナ主表記「フタトキ時計」は alias として残し、
 * 旧表記からの検索流入を取りこぼさない。連濁などの ja 内表記揺れは
 * APP_EXTRA_VARIANTS に集約。
 */
export const BRAND_ALIASES: Record<string, readonly string[]> = {
  ja: [
    "知育時計ふたときアプリ",
    "知育時計ふたとき",
    "ふたとき時計",
    "フタトキ時計",
    "ふたときアプリ",
    "ふたとき",
  ],
  en: ["Futatoki the Learning Clock", "Futatoki the Clock", "Futatoki App"],
  "zh-CN": ["Futatoki 教学时钟", "Futatoki 双面时钟", "Futatoki 应用"],
  "zh-TW": ["Futatoki 教學時鐘", "Futatoki 雙面時鐘", "Futatoki App"],
  ko: ["Futatoki 학습 시계", "Futatoki 시계", "Futatoki 앱"],
  es: ["Futatoki Reloj Educativo", "Futatoki Reloj", "Futatoki App"],
  fr: ["Futatoki Horloge Éducative", "Futatoki Horloge", "Futatoki App"],
  de: ["Futatoki Lernuhr", "Futatoki Uhr", "Futatoki App"],
  it: ["Futatoki Orologio Didattico", "Futatoki Orologio", "Futatoki App"],
  "pt-BR": ["Futatoki Relógio Educativo", "Futatoki Relógio", "Futatoki App"],
  ru: ["Futatoki Обучающие Часы", "Futatoki Часы", "Futatoki Приложение"],
  ar: ["Futatoki ساعة تعليمية", "Futatoki ساعة", "Futatoki تطبيق"],
  hi: ["Futatoki शैक्षिक घड़ी", "Futatoki घड़ी", "Futatoki ऐप"],
  id: ["Futatoki Jam Belajar", "Futatoki Jam", "Futatoki App"],
  th: ["Futatoki นาฬิกาเรียนรู้", "Futatoki นาฬิกา", "Futatoki แอป"],
  tr: ["Futatoki Öğrenme Saati", "Futatoki Saat", "Futatoki Uygulama"],
  pl: ["Futatoki Zegar do Nauki", "Futatoki Zegar", "Futatoki Aplikacja"],
  fa: ["Futatoki ساعت آموزشی", "Futatoki ساعت", "Futatoki برنامه"],
  ur: ["Futatoki تعلیمی گھڑی", "Futatoki گھڑی", "Futatoki ایپ"],
  bn: ["Futatoki শিক্ষামূলক ঘড়ি", "Futatoki ঘড়ি", "Futatoki অ্যাপ"],
};
