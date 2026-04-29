/**
 * ぐりぐり (drag) 操作スタイル。manual サブモードのドラッグ操作スタイル 2 種の一つで、ポインタ移動の
 * 累積ピクセル数を分に変換して時刻を進める。状態は呼び出し側 (ClockLayout の dragRef) が保持し、
 * このモジュールは純関数のみ。crank.ts と相互排他で drag が default。
 *
 * 何ピクセルで 1 分進めるかは viewport の対角線長に線形比例。スマホ実機 (~900px 対角) で 6 px/min
 * が良い感触だったので、その比を保って「対角線フルドラッグ ≒ 150 分」を画面サイズ非依存に固定する。
 * PC / タブレットの大画面でついうっかり進みすぎる問題への対処。dragStart 時の値を state に capture
 * してドラッグ中は固定 (途中で resize / アドレスバー伸縮に追従して感度がブレる方が嫌なので)。
 */

const REFERENCE_DIAGONAL_PX = 900;
const REFERENCE_PX_PER_MINUTE = 6;

const computePxPerMinute = (): number => {
  if (typeof window === "undefined") return REFERENCE_PX_PER_MINUTE;
  const diagonal = Math.hypot(window.innerWidth, window.innerHeight);
  return REFERENCE_PX_PER_MINUTE * (diagonal / REFERENCE_DIAGONAL_PX);
};

export type DragDragState = {
  lastX: number;
  lastY: number;
  cumPixels: number;
  startMinutes: number;
  pointerId: number;
  /** dragStart 時にスナップした px/min。viewport 対角線長から導出。 */
  pxPerMinute: number;
};

/** ポインタ押下時に呼ぶ。 */
export const dragStart = (
  e: PointerEvent,
  startMinutes: number,
): DragDragState => ({
  lastX: e.clientX,
  lastY: e.clientY,
  cumPixels: 0,
  startMinutes,
  pointerId: e.pointerId,
  pxPerMinute: computePxPerMinute(),
});

/** ポインタ移動時に呼ぶ。state を破壊的に更新し、rotateMinutes に反映すべき新しい値を返す。 */
export const dragAdvance = (
  e: PointerEvent,
  s: DragDragState,
): number => {
  const dx = e.clientX - s.lastX;
  const dy = e.clientY - s.lastY;
  s.cumPixels += Math.hypot(dx, dy);
  s.lastX = e.clientX;
  s.lastY = e.clientY;
  return s.startMinutes + s.cumPixels / s.pxPerMinute;
};
