import type { Component } from "solid-js";
import ZentralIcon from "./ZentralIcon";
import rawSvg from "./svg/eye.svg?raw";

/**
 * 目 = 「見える」の定番 icon。読むために残す針を選ぶメニューのトリガーに使う。
 * viewBox 24x24、アーモンド形の輪郭と中心の瞳。塗りは持たず stroke だけで描き、色は
 * currentColor で外側 CSS text color に追従する。図形は ./svg/eye.svg。
 */
const EyeIcon: Component<{ class?: string }> = (props) => (
  <ZentralIcon svg={rawSvg} class={props.class} />
);

export default EyeIcon;
