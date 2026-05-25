import type { Component } from "solid-js";

/**
 * 「すたーと」ボタン用の再生 (▶) icon。viewBox 24x24、右向き三角形を塗りで描く。色は currentColor で
 * 外側 CSS text color に追従、stroke-linejoin=round で角を丸めて子ども向け UI に馴染ませる。
 */
const PlayIcon: Component<{ class?: string }> = (props) => (
  <svg
    viewBox="0 0 24 24"
    class={props.class}
    aria-hidden="true"
    fill="currentColor"
    stroke="currentColor"
    stroke-width="1.5"
    stroke-linejoin="round"
  >
    <polygon points="7 5, 19 12, 7 19" />
  </svg>
);

export default PlayIcon;
