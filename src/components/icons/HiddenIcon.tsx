import type { Component } from "solid-js";
import ZentralIcon from "./ZentralIcon";
import rawSvg from "./svg/hidden.svg?raw";

/**
 * 斜線を引いた目 = 「隠す」の定番 icon。針を薄める (ほぼ見えなくする) メニューのトリガーに使う。
 * viewBox 24x24、アーモンド形の輪郭と中心の瞳に左下から右上への斜線を重ねる。塗りは持たず
 * stroke だけで描き、色は currentColor で外側 CSS text color に追従する。図形は ./svg/hidden.svg。
 */
const HiddenIcon: Component<{ class?: string }> = (props) => (
  <ZentralIcon svg={rawSvg} class={props.class} />
);

export default HiddenIcon;
