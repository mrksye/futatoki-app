import type { Component } from "solid-js";
import ZentralIcon from "./ZentralIcon";
import rawSvg from "./svg/mute.svg?raw";

/**
 * 「しずかに」ボタン用のスピーカー + 斜線 icon。CheckIcon と同じ stroke 設計 (currentColor / 角丸)。
 * スピーカー本体は左寄せ三角 + 短い矩形、斜線は左下→右上で speaker 全体を横断する。図形は
 * ./svg/mute.svg。
 */
const MuteIcon: Component<{ class?: string }> = (props) => (
  <ZentralIcon svg={rawSvg} class={props.class} />
);

export default MuteIcon;
