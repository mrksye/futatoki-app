import { DEFAULT_LOCALE } from "./locales";
import { matchLocale } from "./match";

/** localStorage キー。LP (futatoki.app) と同名だが play.futatoki.app と別オリジン扱いなので実体は
 *  分かれる (命名だけ揃えてある)。 */
const STORAGE_KEY = "futatoki:locale";

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
          console.warn("[futatoki-app] localStorage.setItem(locale) failed:", e);
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
      console.warn("[futatoki-app] localStorage.getItem(locale) failed:", e);
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
