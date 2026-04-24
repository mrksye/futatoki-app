/**
 * ぐりぐり (drag) 操作スタイル。
 * 自由回転モードの manual サブモードのドラッグ操作スタイル2種のうちの一つ。
 * ポインタ移動の累積ピクセル数を分に変換して時刻を進める。
 *
 * Public API:
 *   - 操作: DragDragState, dragStart, dragAdvance, PX_PER_MINUTE
 *
 * このモジュールは状態を持たない (state は呼び出し側 = ClockLayout が dragRef に保持)。
 * crank.ts と相互排他で、drag が default。
 */

/** 何ピクセル動かしたら1分進むか */
export const PX_PER_MINUTE = 6;

export type DragDragState = {
  lastX: number;
  lastY: number;
  cumPixels: number;
  startMinutes: number;
  pointerId: number;
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
});

/**
 * ポインタ移動時に呼ぶ。state を破壊的に更新し、
 * rotateMinutes に反映すべき新しい値を返す。
 */
export const dragAdvance = (
  e: PointerEvent,
  s: DragDragState,
): number => {
  const dx = e.clientX - s.lastX;
  const dy = e.clientY - s.lastY;
  s.cumPixels += Math.hypot(dx, dy);
  s.lastX = e.clientX;
  s.lastY = e.clientY;
  return s.startMinutes + s.cumPixels / PX_PER_MINUTE;
};
