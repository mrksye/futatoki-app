import type { Component } from "solid-js";
import ZentralIcon from "./ZentralIcon";
import rawSvg from "./svg/pause.svg?raw";

/**
 * 一時停止 (⏸) icon。viewBox 24x24、角丸の縦バー 2 本。色は currentColor で外側 CSS text color に追従、
 * 角丸 (rx) で子ども向け UI に馴染ませる (PlayIcon と対の見た目)。図形は ./svg/pause.svg。
 */
const PauseIcon: Component<{ class?: string }> = (props) => (
  <ZentralIcon svg={rawSvg} class={props.class} />
);

export default PauseIcon;
