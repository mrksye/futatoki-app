import type { Component } from "solid-js";

/**
 * 「しずかに」ボタン用のスピーカー + 斜線 icon。CheckIcon と同じ stroke 設計 (currentColor / 角丸)。
 * スピーカー本体は左寄せ三角 + 短い矩形、斜線は左下→右上で speaker 全体を横断する。
 */
const MuteIcon: Component<{ class?: string }> = (props) => (
  <svg
    viewBox="0 0 24 24"
    class={props.class}
    aria-hidden="true"
    fill="none"
    stroke="currentColor"
    stroke-width="2.2"
    stroke-linecap="round"
    stroke-linejoin="round"
  >
    <path d="M4 9 L4 15 L8 15 L13 19 L13 5 L8 9 Z" />
    <line x1="17" y1="8" x2="22" y2="16" />
    <line x1="22" y1="8" x2="17" y2="16" />
  </svg>
);

export default MuteIcon;
