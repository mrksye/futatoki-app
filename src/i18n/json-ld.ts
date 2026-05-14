import type { LocaleMeta } from "./locales";
import { APP_BRAND, APP_EXTRA_VARIANTS, BRAND_ALIASES, OFFICIAL_BRAND } from "./brand";

const SOURCE = "ja";
const APP_URL = "https://play.futatoki.app/";

/**
 * <script type="application/ld+json"> の payload。
 *
 * - name は OFFICIAL_BRAND[locale] (正式名称、Futatoki the Learning Clock 系)。
 *   schema.org の primary name は entity の正式名称を据えるのが本来用途。
 * - alternateName は BRAND_ALIASES と APP_EXTRA_VARIANTS を全 locale 分
 *   flatten + APP_BRAND の各 locale 値 + "Futatoki" 短縮形、ただし name と
 *   重複する値は除外し、配列内の重複も除く。これにより Google が「正式名 /
 *   愛称 / アプリ版 / 短縮 / 旧表記 / 連濁揺れ」を全部このアプリの別名として
 *   認識する (LP との SEO 整合 + 表記揺れ網羅)。
 * - description は resources の meta.description を流用。
 * - inLanguage は BCP47 タグそのまま。
 */
function buildJsonLd(locale: LocaleMeta, description: string) {
  const name = OFFICIAL_BRAND[locale.code] ?? OFFICIAL_BRAND[SOURCE];
  const allVariants = [
    ...Object.values(BRAND_ALIASES).flat(),
    ...Object.values(APP_EXTRA_VARIANTS).flat(),
    ...Object.values(APP_BRAND),
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
 * 書くより全 locale 一律に runtime 生成したほうが BRAND_ALIASES との
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
