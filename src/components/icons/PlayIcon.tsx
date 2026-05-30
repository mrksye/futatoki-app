import type { Component } from "solid-js";
import ZentralIcon from "./ZentralIcon";
import rawSvg from "./svg/play.svg?raw";

/**
 * 「すたーと」ボタン用の再生 (▶) icon。viewBox 24x24、右向き三角形を塗りで描く。色は currentColor で
 * 外側 CSS text color に追従、stroke-linejoin=round で角を丸めて子ども向け UI に馴染ませる。図形は
 * ./svg/play.svg。
 */
const PlayIcon: Component<{ class?: string }> = (props) => (
  <ZentralIcon svg={rawSvg} class={props.class} />
);

export default PlayIcon;
