import { For, createUniqueId, type Component } from "solid-js";

/**
 * 8 歯のまるい歯車アイコン。⚙ emoji を OS ごとの絵柄差で使いたくないので SVG primitives で組む。
 * viewBox 24x24、中心 (12,12)、本体半径 9 (viewBox を太く使う、歯を低めにした分を相殺)、歯は
 * (10,0.5)-(14,5) の pill 形 rect (w=4, h=4.5, rx=2 で上下端が完全な半円)、中心穴は mask で
 * 半径 4 を抜く。歯の可視高さ ≒ 2.5 (本体半径の 28%) と低めに抑えて「カクカクした gear tooth
 * 感」を消し、本体を太くすることでアイコン全体は viewBox 限界まで大きく見せる。色は
 * currentColor で CSS text color に追従。穴の透過は mask 経由でボタン背景がそのまま透ける。
 * 複数インスタンスでも mask id 衝突しないように createUniqueId で固有化。
 */
const TOOTH_ANGLES = [0, 45, 90, 135, 180, 225, 270, 315] as const;

const GearIcon: Component<{ class?: string }> = (props) => {
  const holeId = createUniqueId();
  return (
    <svg viewBox="0 0 24 24" class={props.class} aria-hidden="true">
      <mask id={holeId}>
        <rect width="24" height="24" fill="white" />
        <circle cx="12" cy="12" r="4" fill="black" />
      </mask>
      <g fill="currentColor" mask={`url(#${holeId})`}>
        <circle cx="12" cy="12" r="9" />
        <For each={TOOTH_ANGLES}>
          {(angle) => (
            <rect
              x="10"
              y="0.5"
              width="4"
              height="4.5"
              rx="2"
              transform={`rotate(${angle} 12 12)`}
            />
          )}
        </For>
      </g>
    </svg>
  );
};

export default GearIcon;
