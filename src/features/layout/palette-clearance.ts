import { createEffect, on, onMount, createSignal } from "solid-js";
import { useIsTablet } from "../../hooks/useIsTablet";

/**
 * Palette ボタン (右中央 / 下中央 floating) の最大幅・高さ。全 palette ラベルのうち一番大きい
 * ボタンの寸法を保持する。
 *
 * floating ボタンが時計と被らないよう、ClockLayout 側がこの値を読んで時計 SVG の max size を
 * 制限する。max を取ることで「palette 連打中に時計サイズが変動する」のを防ぐ。
 *
 * 値は mount 時に hidden な ghost button を一度描画して測る。同じ locale 内ではボタン幅は
 * font / padding が固定なので不変。tablet breakpoint を跨ぐと CSS の `tablet:` variant で
 * font-size / padding が変わるので再測定する (普通の resize や window 幅微調整では再測定しない)。
 */

const [paletteMaxBtnWidth, setPaletteMaxBtnWidthRaw] = createSignal(0);
const [paletteMaxBtnHeight, setPaletteMaxBtnHeightRaw] = createSignal(0);

export { paletteMaxBtnWidth, paletteMaxBtnHeight };

/** offscreen に hidden 描画して全ラベルの max width / height を返す。`button[aria-label]::before`
 *  CSS rule (index.css 参照) でラベルが疑似要素として描画されるので、aria-label をセットすれば
 *  実際の表示と同じ寸法が取れる。 */
function measure(
  labels: readonly string[],
  btnClassName: string,
): { width: number; height: number } {
  const ghost = document.createElement("div");
  ghost.style.cssText =
    "position:absolute;visibility:hidden;pointer-events:none;left:-9999px;top:0";
  document.body.appendChild(ghost);
  let maxW = 0;
  let maxH = 0;
  try {
    for (const label of labels) {
      const b = document.createElement("button");
      b.className = btnClassName;
      b.setAttribute("aria-label", label);
      ghost.appendChild(b);
      maxW = Math.max(maxW, b.offsetWidth);
      maxH = Math.max(maxH, b.offsetHeight);
    }
  } finally {
    document.body.removeChild(ghost);
  }
  return { width: maxW, height: maxH };
}

/**
 * SettingsPanel の component 内で 1 回だけ呼ぶ。mount 時に web font 読み込み完了を待って
 * 初回 measure し、その後 tablet breakpoint 跨ぎでだけ debounce 付き再 measure する。
 *
 * @param getLabels  call 時の locale で全 palette ラベルを返す関数
 * @param btnClassName  SettingsPanel の `btnClass` と同じ文字列 (実ボタンと同じ装飾を再現するため)
 */
export function usePaletteClearance(
  getLabels: () => readonly string[],
  btnClassName: string,
) {
  const isTablet = useIsTablet();
  let debounceTimer: ReturnType<typeof setTimeout> | undefined;

  const remeasure = () => {
    const { width, height } = measure(getLabels(), btnClassName);
    setPaletteMaxBtnWidthRaw(width);
    setPaletteMaxBtnHeightRaw(height);
  };

  onMount(() => {
    // self-hosted Nunito の読み込み完了前に測ると metrics がフォールバック font 基準になる。
    // document.fonts が未対応 (ごく古い browser) なら即時 measure。
    if (typeof document !== "undefined" && document.fonts?.ready) {
      document.fonts.ready.then(remeasure);
    } else {
      remeasure();
    }
  });

  // useIsTablet の signal 変化に追従。defer: true で初回 (= mount と同タイミング) はスキップして
  // breakpoint 跨ぎ時のみ再測定する。debounce で window edge を高速にドラッグして boundary を
  // 何度も跨ぐようなケースで余計な measure を抑える。
  createEffect(
    on(
      isTablet,
      () => {
        if (debounceTimer !== undefined) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
          debounceTimer = undefined;
          remeasure();
        }, 100);
      },
      { defer: true },
    ),
  );
}

/** 円中心 (cx, cy) を変えずに、与えた長方形 rect (margin だけ膨らませた版) と交差しない円の
 *  最大半径を返す。中心が長方形内にある場合は 0。 */
function maxRadiusAvoidingRect(
  cx: number,
  cy: number,
  rectL: number,
  rectT: number,
  rectR: number,
  rectB: number,
  margin: number,
): number {
  const eL = rectL - margin;
  const eT = rectT - margin;
  const eR = rectR + margin;
  const eB = rectB + margin;
  const closestX = Math.max(eL, Math.min(cx, eR));
  const closestY = Math.max(eT, Math.min(cy, eB));
  const dx = cx - closestX;
  const dy = cy - closestY;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * floating palette ボタンが時計と被らないために、各 clock 半盤の最大表示寸法 (diameter) を返す。
 *
 * 設計思想:
 *   - 時計中心はずらさない (vw/2, vh/4 等の自然位置のまま)。padding を入れて中央寄りに
 *     ずらすアプローチは不要に小さくなる + 中央性を崩す。
 *   - 円が長方形 (button rect) と交差しない条件は「中心〜長方形最近点距離 ≥ 半径」。
 *     これは水平/垂直 clear より一般的で、ナナメ方向の余裕も活かせるので最も大きい R が取れる。
 *   - 自然 max は min(halfW, halfH) なのでそれを上限に取る。
 *
 * portrait: AM (top half) と PM (bottom half) は viewport 中心 (vh/2) のボタンに対して対称な
 * 制約を受けるので片方計算すれば両方同じ値。landscape も同様。
 *
 * @param vw / vh  viewport 寸法
 * @param isLandscape  layout 向き
 * @param btnW / btnH  全 palette ラベルのうちの max ボタン寸法
 * @param edgeMargin  ボタンと viewport 端の距離 (CSS の `right-2` / `bottom-2` = 8px)
 * @param safetyMargin  ボタンと clock の最小視覚 clearance
 */
export function computeMaxClockSize(
  vw: number,
  vh: number,
  isLandscape: boolean,
  btnW: number,
  btnH: number,
  edgeMargin: number,
  safetyMargin: number,
): number {
  const halfW = isLandscape ? vw / 2 : vw;
  const halfH = isLandscape ? vh : vh / 2;
  const naturalSize = Math.min(halfW, halfH);

  if (btnW === 0 || btnH === 0) return naturalSize;

  // AM clock 中心 (viewport coord)。portrait は (vw/2, vh/4)、landscape は (vw/4, vh/2)。
  // 両者とも (halfW/2, halfH/2) に等しい (top-half / left-half は origin 0 なので)。
  const amCx = halfW / 2;
  const amCy = halfH / 2;

  // palette ボタンの viewport 座標 rect。
  let btnL: number;
  let btnT: number;
  let btnR: number;
  let btnB: number;
  if (isLandscape) {
    // bottom-center
    btnL = vw / 2 - btnW / 2;
    btnT = vh - edgeMargin - btnH;
    btnR = vw / 2 + btnW / 2;
    btnB = vh - edgeMargin;
  } else {
    // right-center
    btnL = vw - edgeMargin - btnW;
    btnT = vh / 2 - btnH / 2;
    btnR = vw - edgeMargin;
    btnB = vh / 2 + btnH / 2;
  }

  const maxR = maxRadiusAvoidingRect(amCx, amCy, btnL, btnT, btnR, btnB, safetyMargin);
  return Math.min(naturalSize, maxR * 2);
}
