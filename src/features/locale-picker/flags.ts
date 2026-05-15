import { resetNumeralSystemChoice } from "../settings/numeral-system";

/**
 * locale code → 国旗絵文字。表示は地域慣習・国際的な代表値に従う:
 *   en → 🇺🇸  (LP の英語コピーが米国式なので合わせる)
 *   pt-BR → 🇧🇷
 *   es → 🇪🇸 (世界の話者数では MX が多いが言語名 "Español" は ES 起点)
 *   ar → 🇸🇦 (アラビア語の代表国は文脈依存だが SA を採用、本来は地域連盟旗が無難)
 *   bn → 🇧🇩 (バングラデシュ標準。インド西ベンガル州も話すが国境は BD)
 *   hi → 🇮🇳
 *   ur → 🇵🇰
 *   fa → 🇮🇷
 *
 * Windows Chromium は国旗絵文字を box でレンダする既知の制約あり (Segoe UI Emoji が
 * 未対応のため)。本アプリは絵文字で許容する設計判断。
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

/** ?lang=xx に書き換えて full reload。i18n/detect.ts と同じ key で localStorage にも保存される
 *  (URL パラメータ経由で I18nProvider 起動時に detectLocale() が拾う)。
 *
 *  reload 前に numeralSystemChoice を reset するのは、過去に別 locale で alternate を選んだ履歴
 *  (例: bn で western に toggle 済) が新 locale の default を上書きするのを防ぐため。これを
 *  しないと bn → 別 locale → bn 復帰時にベンガル数字でなく western のまま、という不整合が出る。 */
export const switchLocaleByReload = (code: string): void => {
  resetNumeralSystemChoice();
  const url = new URL(window.location.href);
  url.searchParams.set("lang", code);
  window.location.href = url.toString();
};
