/**
 * ブランド表記ルール。LP (futatoki.app) と play.futatoki.app の二層構造。
 *
 * - LP_BRAND: LP 側で使うブランド本体表記。description 本文中の引用や
 *   JSON-LD alternateName 用。アプリ側の UI/og:site_name には使わない。
 * - APP_BRAND: アプリ版表記。manifest.name / og:site_name / <title> 内で
 *   LP 本体と差別化し「アプリ版」ポジションを保つ。
 *
 * ja/en のみ定義。他 18 locale は段階 4 で追加。
 */

export const LP_BRAND: Record<string, string> = {
  ja: "フタトキ時計",
  en: "Futatoki the Clock",
};

export const APP_BRAND: Record<string, string> = {
  ja: "フタトキアプリ",
  en: "Futatoki App",
};

/** iOS Safari ホーム画面追加時のラベル。12 文字目安で各 locale 短縮形。 */
export const APPLE_TITLE: Record<string, string> = {
  ja: "フタトキ",
  en: "Futatoki",
};

/** og:locale (BCP47 を underscore + 大文字 region に変換した Open Graph 形式)。 */
export const OG_LOCALE: Record<string, string> = {
  ja: "ja_JP",
  en: "en_US",
};

/**
 * LP HomePage.astro の BRAND_VARIANTS と同じ構造。JSON-LD alternateName で
 * 全 locale variants を flatten して使う (段階 3)。
 */
export const LP_BRAND_VARIANTS: Record<string, readonly string[]> = {
  ja: ["フタトキ時計", "ふたとき時計", "フタトキ", "ふたとき"],
  en: ["Futatoki the Clock"],
};
