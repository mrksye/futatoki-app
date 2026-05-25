import type { Component } from "solid-js";

/**
 * 「とりけし」ボタン用の取り消し (✕) icon。viewBox 24x24、交差する 2 本線。色は currentColor で外側
 * CSS text color に追従、stroke-linecap=round で端を丸めて子ども向け UI に馴染ませる。
 */
const CancelIcon: Component<{ class?: string }> = (props) => (
  <svg
    viewBox="0 0 24 24"
    class={props.class}
    aria-hidden="true"
    fill="none"
    stroke="currentColor"
    stroke-width="2.5"
    stroke-linecap="round"
  >
    <line x1="6" y1="6" x2="18" y2="18" />
    <line x1="18" y1="6" x2="6" y2="18" />
  </svg>
);

export default CancelIcon;
