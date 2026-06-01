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

/** LP / Worker 由来の ?lang=xx を URL から消す。detectLocale() が localStorage に取り込んだ後に
 *  起動時 1 回だけ呼ぶ前提。iOS / Android とも「ホーム画面に追加」は追加時点の現在 URL を起動 URL
 *  として焼くので、?lang を残したまま install されると毎起動その値が localStorage の選択を上書きし、
 *  アプリ内の言語切り替えが保存されなくなる。起動直後に消して、ユーザが install する時点で URL を
 *  clean にしておくのが狙い (replaceState は現セッションのアドレスバーを消すだけで、install 済み
 *  端末に焼かれた起動 URL は書き換えられないため、あくまで新規 install への予防)。reload も Worker の
 *  lang redirect も挟まず、lang 以外の query と hash は保つ。 */
export function stripLangParamFromUrl(): void {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  if (!url.searchParams.has("lang")) return;
  url.searchParams.delete("lang");
  const query = url.searchParams.toString();
  const cleaned = `${url.pathname}${query ? `?${query}` : ""}${url.hash}`;
  try {
    window.history.replaceState(window.history.state, "", cleaned);
  } catch (e) {
    console.warn(`${BRAND_CONFIG.logPrefix} history.replaceState(strip lang) failed:`, e);
  }
}
