import type { Component } from "solid-js";
import ZentralIcon from "./ZentralIcon";
import rawSvg from "./svg/cancel.svg?raw";

/**
 * 「とりけし」ボタン用の取り消し (✕) icon。viewBox 24x24、交差する 2 本線。色は currentColor で外側
 * CSS text color に追従、stroke-linecap=round で端を丸めて子ども向け UI に馴染ませる。図形は
 * ./svg/cancel.svg。
 */
const CancelIcon: Component<{ class?: string }> = (props) => (
  <ZentralIcon svg={rawSvg} class={props.class} />
);

export default CancelIcon;
