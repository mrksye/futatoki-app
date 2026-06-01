import { DEFAULT_LOCALE } from "./locales";
import { matchLocale } from "./match";
import { BRAND_CONFIG } from "../../branding/brand.config";

/** localStorage キー。同 host 上の併存サービス (LP 等) と origin 分離する想定で
 *  prefix だけ揃える運用。値は brand.config.ts の storagePrefix から組み立てる。 */
const STORAGE_KEY = `${BRAND_CONFIG.storagePrefix}:locale`;

/** 優先順位: localStorage 保存値 → navigator.languages 先頭から順にマッチ → DEFAULT_LOCALE。
 *
 *  URL の ?lang は表示判断に使わない。?lang は Worker / SEO が URL に載せる「今の表示言語の鏡」で
 *  あって、ユーザーの選択ではないため。これにより install の起動 URL や Worker リダイレクトに ?lang が
 *  載っても、保存済みの選択 (localStorage) が常に勝ち、アプリ内で選んだ言語が永続する。localStorage に
 *  書くのは persistLocale() = アプリ内切り替えだけなので、「保存値があれば必ずユーザーの明示選択」と
 *  断定でき、言語まわりのバグ切り分けがしやすい。 */
export function detectLocale(): string {
  if (typeof window !== "undefined") {
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

/** ユーザーの明示選択 (アプリ内の言語切り替え) を localStorage に保存する。localStorage に書くのは
 *  この経路だけに限定することで「保存値 = 明示選択」の不変条件を保つ。STORAGE_KEY を detect 側に
 *  閉じ込めたいので flags.ts からはこの関数を経由する。 */
export function persistLocale(locale: string): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, locale);
  } catch (e) {
    console.warn(`${BRAND_CONFIG.logPrefix} localStorage.setItem(locale) failed:`, e);
  }
}

/** 起動時に URL の ?lang を「今表示している言語」に揃える。detectLocale() の結果を渡して呼ぶ。
 *  ?lang は表示判断には使わない (detectLocale は localStorage/navigator で決める) が、アプリ URL が
 *  共有されたときに受け手側のスクレイパーが ?lang を見て送信者の言語で OG カードを生成できるよう、
 *  常に現在の表示言語を映しておく。?lang は localStorage より弱い (detectLocale が読まない) ので、
 *  install の起動 URL に古い ?lang が焼き付いても無害で、消す必要はない。replaceState なので reload も
 *  Worker redirect も挟まず、lang 以外の query と hash は保つ。 */
export function syncLangParamInUrl(locale: string): void {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  url.searchParams.set("lang", locale);
  if (url.search === window.location.search) return;
  try {
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
  } catch (e) {
    console.warn(`${BRAND_CONFIG.logPrefix} history.replaceState(sync lang) failed:`, e);
  }
}
