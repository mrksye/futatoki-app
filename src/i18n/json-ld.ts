import type { LocaleMeta } from "./locales";
import { APP_BRAND, APP_EXTRA_VARIANTS, LP_BRAND_VARIANTS } from "./brand";

const SOURCE = "ja";
const APP_URL = "https://play.futatoki.app/";

/**
 * <script type="application/ld+json"> の payload。
 *
 * - name は APP_BRAND[locale] (アプリ版表記)。
 * - alternateName は LP_BRAND_VARIANTS と APP_EXTRA_VARIANTS を全 locale 分
 *   flatten + "Futatoki" 短縮形、ただし name と重複する値は除外し、配列内の
 *   重複も除く。これにより Google が「ふたとき時計 / Futatoki the Clock /
 *   各国語の本体表記 / アプリ独自の表記揺れ」を全部このアプリの別名として
 *   認識する (LP との SEO 整合 + 表記揺れ網羅)。
 * - description は resources の meta.description を流用。
 * - inLanguage は BCP47 タグそのまま。
 */
function buildJsonLd(locale: LocaleMeta, description: string) {
  const name = APP_BRAND[locale.code] ?? APP_BRAND[SOURCE];
  const allVariants = [
    ...Object.values(LP_BRAND_VARIANTS).flat(),
    ...Object.values(APP_EXTRA_VARIANTS).flat(),
  ];
  const alternateName = [...allVariants, "Futatoki"].filter(
    (value, index, array) =>
      value !== name && array.indexOf(value) === index,
  );

  return {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name,
    alternateName,
    description,
    url: APP_URL,
    applicationCategory: "EducationalApplication",
    operatingSystem: "Any",
    browserRequirements: "Requires JavaScript",
    isAccessibleForFree: true,
    inLanguage: locale.code,
  };
}

/**
 * locale 切替時に <head> 内の JSON-LD <script> を再生成する。
 *
 * static index.html には埋め込まず runtime で append する方針。Googlebot は
 * JS を実行するので runtime 出力で問題なし、また static 1 locale 分だけ
 * 書くより全 locale 一律に runtime 生成したほうが LP_BRAND_VARIANTS との
 * 同期が自動化される。
 *
 * 翻訳未整備 locale (description が無い) では何もせず、JSON-LD 自体を
 * 出さない方針 (SEO ノイズより未提供のほうが安全)。
 */
export function applyJsonLd(
  locale: LocaleMeta,
  dict: Record<string, string>,
) {
  if (typeof document === "undefined") return;

  const description = dict["meta.description"];
  if (!description) return;

  const payload = buildJsonLd(locale, description);
  let script = document.querySelector<HTMLScriptElement>(
    'script[type="application/ld+json"]',
  );
  if (!script) {
    script = document.createElement("script");
    script.type = "application/ld+json";
    document.head.appendChild(script);
  }
  script.textContent = JSON.stringify(payload);
}
