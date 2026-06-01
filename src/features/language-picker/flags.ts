import { resetNumeralSystemChoice } from "../settings/numeral-system";
import { setHourNumeralsHidden } from "../settings/nothing-digits-font";
import { persistLocale } from "../../i18n/detect";

/**
 * locale code → 国旗絵文字。地域慣習・国際的な代表値に従う:
 *   en → 🇺🇸 (LP の英語コピーが米国式なので揃える)
 *   es → 🇪🇸 (世界の話者数では MX 多いが言語名 "Español" は ES 起点)
 *   ar → 🇸🇦 (アラビア語の代表国は文脈依存、本来は地域連盟旗が無難だが SA で代用)
 *   bn → 🇧🇩 (バングラデシュ標準。インド西ベンガル州も話すが国境は BD)
 *
 * Windows Chromium は国旗絵文字を box でレンダする既知の制約あり (Segoe UI Emoji 未対応)。
 * 本アプリは絵文字で許容する設計判断。
 */
export const LANGUAGE_FLAG: Readonly<Record<string, string>> = {
  en: "🇺🇸",
  ja: "🇯🇵",
  es: "🇪🇸",
  fr: "🇫🇷",
  de: "🇩🇪",
  it: "🇮🇹",
  "pt-BR": "🇧🇷",
  "zh-CN": "🇨🇳",
  "zh-TW": "🇹🇼",
  ko: "🇰🇷",
  ru: "🇷🇺",
  pl: "🇵🇱",
  tr: "🇹🇷",
  th: "🇹🇭",
  ar: "🇸🇦",
  fa: "🇮🇷",
  ur: "🇵🇰",
  hi: "🇮🇳",
  bn: "🇧🇩",
  id: "🇮🇩",
};

/** 選択言語を localStorage に明示保存 (persistLocale) してから ?lang=xx 付きで replace reload する。
 *  保存値は detectLocale の最優先なので、reload 後はもちろん install 後の再起動でも選んだ言語が勝つ
 *  (URL の ?lang は表示判断に使われず、Worker が初期 HTML を選ぶ / OG の鏡になるだけ)。location.href
 *  代入は history に新エントリを積むので戻るボタンで言語切替前に戻れてしまう = 子供向け UI として
 *  不適切。replace で現エントリを上書きする。数字系 signal を 2 本ともクリアするのは、過去の locale で
 *  選んだ「alternate 体系」や「時数を隠す」状態が新 locale の default 表示を上書きするのを防ぐため
 *  (例: bn で western にしていた、あるいは時数を隠していた状態のまま en へ切り替えたら、en の文字盤が
 *  いきなり消えてる体験になってしまう)。 */
export const switchLanguageByReload = (code: string): void => {
  resetNumeralSystemChoice();
  setHourNumeralsHidden(false);
  persistLocale(code);
  const url = new URL(window.location.href);
  url.searchParams.set("lang", code);
  window.location.replace(url.toString());
};
