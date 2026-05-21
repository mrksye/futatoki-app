import { createUniqueId, type Component } from "solid-js";

/**
 * モードピッカートリガー用アイコン: 2 枚の矩形を斜めにずらして重ねた図形で「複数のモード /
 * 切替」を表現。アプリ名「ふたとき」(2 つの時計) の双対イメージとも呼応する。前面矩形が背面
 * 矩形を部分的に隠す効果は mask で背面 stroke を切り抜くことで実現 (前面に opaque fill を載せる
 * 方式は親ボタンの bg-white/80 と色がズレるため)。stroke-width 2 で太め、stroke-linejoin=round
 * で角を丸めて子ども向け UI に馴染ませる。色は currentColor で外から CSS text color に追従、
 * 複数インスタンスでも mask id が衝突しないように createUniqueId で固有化。
 */
const ModeIcon: Component<{ class?: string }> = (props) => {
  const cutoutId = createUniqueId();
  return (
    <svg
      viewBox="0 0 24 24"
      class={props.class}
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linejoin="round"
    >
      <mask id={cutoutId}>
        <rect width="24" height="24" fill="white" />
        <rect x="3" y="6" width="16" height="14" rx="1" fill="black" />
      </mask>
      <rect
        x="6"
        y="2"
        width="16"
        height="14"
        rx="1"
        mask={`url(#${cutoutId})`}
      />
      <rect x="3" y="6" width="16" height="14" rx="1" />
    </svg>
  );
};

export default ModeIcon;
