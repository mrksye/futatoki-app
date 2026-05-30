import type { Component } from "solid-js";
import ZentralIcon from "./ZentralIcon";
import rawSvg from "./svg/stopwatch.svg?raw";

/**
 * 「せっと」ボタン用のストップウォッチ icon。viewBox 24x24、頭のプランジャ (上の縦棒 + 横キャップ) +
 * 丸い本体 + 1 時方向を指す短い針で構成。線描き (fill なし) で stroke は currentColor に追従し、外側 CSS
 * text color で色付け。stroke-linecap/linejoin=round で子ども向け UI に馴染ませる。図形は
 * ./svg/stopwatch.svg。
 */
const StopwatchIcon: Component<{ class?: string }> = (props) => (
  <ZentralIcon svg={rawSvg} class={props.class} />
);

export default StopwatchIcon;
