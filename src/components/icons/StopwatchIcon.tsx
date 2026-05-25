import type { Component } from "solid-js";

/**
 * 「せっと」ボタン用のストップウォッチ icon。viewBox 24x24、頭のプランジャ (上の縦棒 + 横キャップ) +
 * 丸い本体 + 1 時方向を指す短い針で構成。線描き (fill なし) で stroke は currentColor に追従し、外側 CSS
 * text color で色付け。stroke-linecap/linejoin=round で子ども向け UI に馴染ませる。
 */
const StopwatchIcon: Component<{ class?: string }> = (props) => (
  <svg
    viewBox="0 0 24 24"
    class={props.class}
    aria-hidden="true"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
  >
    <circle cx="12" cy="14" r="7.5" />
    <line x1="12" y1="6.5" x2="12" y2="2.5" />
    <line x1="9.5" y1="2.5" x2="14.5" y2="2.5" />
    <line x1="12" y1="14" x2="15.2" y2="10.8" />
  </svg>
);

export default StopwatchIcon;
