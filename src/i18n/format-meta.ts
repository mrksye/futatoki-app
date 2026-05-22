import type { LocaleMeta } from "./locales";
import { APP_BRAND, CHARACTER_BRAND, LP_BRAND, OFFICIAL_BRAND } from "../../branding/brand";
import { BRAND_CONFIG } from "../../branding/brand.config";

const SOURCE = "ja";

/**
 * resources/{locale}.json の meta.title / meta.description に埋め込まれた
 * {characterBrand} / {officialBrand} / {lpBrand} / {appBrand} / {appDomain} /
 * {lpDomain} の brand 由来 placeholder を実値で展開する。
 *
 * 5 軸の brand 表記値は locale-specific に branding/brand.ts から、domain 系は
 * brand.config.ts から取得。lpDomain は null 可 (LP を持たない fork 想定) で
 * その場合は appDomain にフォールバック。未定義 placeholder は `{key}` の形で
 * 残し、翻訳ミスや token 名 typo を可視化する (intl-messageformat 撤去時の
 * 方針 — 036207d — と同じ未定義キー保持挙動)。
 */
export function formatMetaString(template: string, locale: LocaleMeta): string {
  const tokens: Record<string, string> = {
    characterBrand: CHARACTER_BRAND[locale.code] ?? CHARACTER_BRAND[SOURCE],
    officialBrand: OFFICIAL_BRAND[locale.code] ?? OFFICIAL_BRAND[SOURCE],
    lpBrand: LP_BRAND[locale.code] ?? LP_BRAND[SOURCE],
    appBrand: APP_BRAND[locale.code] ?? APP_BRAND[SOURCE],
    appDomain: BRAND_CONFIG.domain,
    lpDomain: BRAND_CONFIG.lpDomain ?? BRAND_CONFIG.domain,
  };
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    tokens[name] ?? match,
  );
}
