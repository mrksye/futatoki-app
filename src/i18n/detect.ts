import { DEFAULT_LOCALE } from "./locales";
import { matchLocale } from "./match";
import { BRAND_CONFIG } from "../../branding/brand.config";

/** localStorage キー。同 host 上の併存サービス (LP 等) と origin 分離する想定で
 *  prefix だけ揃える運用。値は brand.config.ts の storagePrefix から組み立てる。 */
const STORAGE_KEY = `${BRAND_CONFIG.storagePrefix}:locale`;

/** 優先順位: URL ?lang=xx (マッチしたら localStorage にも保存) → localStorage 保存値 →
 *  navigator.languages 先頭から順にマッチ → DEFAULT_LOCALE。 */
export function detectLocale(): string {
  if (typeof window !== "undefined") {
    const urlLang = new URLSearchParams(window.location.search).get("lang");
    if (urlLang) {
      const matched = matchLocale(urlLang);
      if (matched) {
        try {
          localStorage.setItem(STORAGE_KEY, matched);
        } catch (e) {
          console.warn(`${BRAND_CONFIG.logPrefix} localStorage.setItem(locale) failed:`, e);
        }
        return matched;
      }
    }
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const matched = matchLocale(saved);
        if (matched) return matched;
      }
    } catch (e) {
      console.warn(`${BRAND_CONFIG.logPrefix} localStorage.getItem(locale) failed:`, e);
    }
  }

  if (typeof navigator !== "undefined") {
    const candidates = navigator.languages?.length
      ? navigator.languages
      : navigator.language
        ? [navigator.language]
        : [];
    for (const cand of candidates) {
      const matched = matchLocale(cand);
      if (matched) return matched;
    }
  }

  return DEFAULT_LOCALE;
}
