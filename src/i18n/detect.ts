import { DEFAULT_LOCALE } from "./locales";
import { matchLocale } from "./match";
import { BRAND_CONFIG } from "../../branding/brand.config";

/** localStorage キー。同 host 上の併存サービス (LP 等) と origin 分離する想定で
 *  prefix だけ揃える運用。値は brand.config.ts の storagePrefix から組み立てる。 */
const STORAGE_KEY = `${BRAND_CONFIG.storagePrefix}:locale`;

/** 優先順位: URL ?setlang=xx (明示選択 → localStorage に保存) → localStorage 保存値 →
 *  URL ?lang=xx (Worker / SEO の表示ヒント、保存しない) → navigator.languages → DEFAULT_LOCALE。
 *
 *  ?setlang と ?lang を分けるのは、明示選択 (LP の言語付きリンク・アプリ内切替) と Worker が
 *  毎ロード注入する Accept-Language 推測 (?lang) を区別するため。localStorage には ?setlang
 *  由来の「明示的に選ばれた言語」だけが入る不変条件を保つことで、言語まわりのバグ切り分け時に
 *  「保存値があれば必ずユーザーの明示選択」と断定できる。明示選択を Worker の推測より優先する
 *  ことで、一度選んだ言語が毎ロードの ?lang に踏み潰されず永続する。 */
export function detectLocale(): string {
  if (typeof window !== "undefined") {
    const params = new URLSearchParams(window.location.search);
    const explicit = params.get("setlang");
    if (explicit) {
      const matched = matchLocale(explicit);
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
    const hint = params.get("lang");
    if (hint) {
      const matched = matchLocale(hint);
      if (matched) return matched;
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

/** LP / Worker 由来の言語クエリ (?setlang / ?lang) を URL から消す。detectLocale() が ?setlang を
 *  localStorage に取り込んだ後に起動時 1 回だけ呼ぶ前提。iOS / Android とも「ホーム画面に追加」は
 *  追加時点の現在 URL を起動 URL として焼くので、言語クエリを残したまま install されると毎起動その
 *  値が効いてアプリ内の言語切り替え体験を乱す。起動直後に消して、ユーザが install する時点で URL を
 *  clean にしておくのが狙い (replaceState は現セッションのアドレスバーを消すだけで、install 済み
 *  端末に焼かれた起動 URL は書き換えられないため、あくまで新規 install への予防)。reload も Worker の
 *  lang redirect も挟まず、言語以外の query と hash は保つ。 */
export function stripLangParamFromUrl(): void {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  if (!url.searchParams.has("lang") && !url.searchParams.has("setlang")) return;
  url.searchParams.delete("lang");
  url.searchParams.delete("setlang");
  const query = url.searchParams.toString();
  const cleaned = `${url.pathname}${query ? `?${query}` : ""}${url.hash}`;
  try {
    window.history.replaceState(window.history.state, "", cleaned);
  } catch (e) {
    console.warn(`${BRAND_CONFIG.logPrefix} history.replaceState(strip lang) failed:`, e);
  }
}
