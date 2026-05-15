import { resetNumeralSystemChoice } from "../settings/numeral-system";

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
export const LOCALE_FLAG: Readonly<Record<string, string>> = {
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

/** ?lang=xx に書き換えて navigation を replace で行う (i18n/detect.ts が起動時に URL から拾い、
 *  同 key で localStorage 永続化)。location.href 代入は history に新エントリを積むので戻るボタン
 *  で言語切替前に戻れてしまう = 子供向け UI として不適切。replace で現エントリを上書きする。
 *  reset 前提は、過去に別 locale で alternate を選んだ履歴 (例: bn で western に toggle 済) が
 *  新 locale の default を上書きするのを防ぐため。 */
export const switchLocaleByReload = (code: string): void => {
  resetNumeralSystemChoice();
  const url = new URL(window.location.href);
  url.searchParams.set("lang", code);
  window.location.replace(url.toString());
};
