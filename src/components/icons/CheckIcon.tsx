import type { Component } from "solid-js";
import ZentralIcon from "./ZentralIcon";
import rawSvg from "./svg/check.svg?raw";

/**
 * 「完了」ボタン用のチェックマーク (✓) icon。viewBox 24x24、stroke で描く太めの角丸チェック。色は
 * currentColor で外側 CSS text color に追従、stroke-linecap/linejoin=round で子ども向け UI に馴染ませる。
 * 図形は ./svg/check.svg。
 */
const CheckIcon: Component<{ class?: string }> = (props) => (
  <ZentralIcon svg={rawSvg} class={props.class} />
);

export default CheckIcon;
