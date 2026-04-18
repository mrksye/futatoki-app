/**
 * UIテキスト集約。
 * 将来の i18n 対応時はここをキー参照に差し替える。
 * 呼び出し側は `strings.settings.hour24` のように参照する。
 */

export const strings = {
  settings: {
    // 時刻表示
    hour24: "24h",
    hour12: "12h",
    // 詳細モード
    sukkiri: "すっきり",
    kuwashiku: "くわしく",
    // 色モード
    sector: "くぎり",
    badge: "すうじ",
    // 自由回転
    rotateEnter: "じゆうかいてん",
    rotateExit: "とけい",
    rotateReset: "げんざいじこく",
    /** 1分戻すボタン */
    rewindMinute: "１ふんもどす",
    // 自由回転の操作スタイル（ボタン表示は「切替先」）
    styleToCrank: "てまわし",
    styleToDrag: "どらっぐ",
    // 自由回転のサブ機能
    autoStart: "じどうかいてん",
    autoStop: "じどうをとめる",
    /** 押すたびに15分刻みの別時刻へ */
    random: "らんだむ",
  },
  badge: {
    am: "\u2600\uFE0F AM",
    pm: "\u{1F319} PM",
  },
} as const;
