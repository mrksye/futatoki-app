import type { Component } from "solid-js";

/**
 * 「完了」ボタン用のチェックマーク (✓) icon。viewBox 24x24、stroke で描く太めの角丸チェック。色は
 * currentColor で外側 CSS text color に追従、stroke-linecap/linejoin=round で子ども向け UI に馴染ませる。
 */
const CheckIcon: Component<{ class?: string }> = (props) => (
  <svg
    viewBox="0 0 24 24"
    class={props.class}
    aria-hidden="true"
    fill="none"
    stroke="currentColor"
    stroke-width="2.6"
    stroke-linecap="round"
    stroke-linejoin="round"
  >
    <polyline points="5 13, 10 18, 19 6" />
  </svg>
);

export default CheckIcon;
