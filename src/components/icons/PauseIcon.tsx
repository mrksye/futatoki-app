import type { Component } from "solid-js";

/**
 * 一時停止 (⏸) icon。viewBox 24x24、角丸の縦バー 2 本。色は currentColor で外側 CSS text color に追従、
 * 角丸 (rx) で子ども向け UI に馴染ませる (PlayIcon と対の見た目)。
 */
const PauseIcon: Component<{ class?: string }> = (props) => (
  <svg
    viewBox="0 0 24 24"
    class={props.class}
    aria-hidden="true"
    fill="currentColor"
  >
    <rect x="6" y="5" width="4" height="14" rx="1.5" />
    <rect x="14" y="5" width="4" height="14" rx="1.5" />
  </svg>
);

export default PauseIcon;
