/**
 * ぐりぐり (drag) 操作スタイル。manual サブモードのドラッグ操作スタイル 2 種の一つで、ポインタ移動の
 * 累積ピクセル数を分に変換して時刻を進める。状態は呼び出し側 (ClockLayout の dragRef) が保持し、
 * このモジュールは純関数のみ。crank.ts と相互排他で drag が default。
 */

/** 何ピクセル動かしたら 1 分進むか。 */
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
  return s.startMinutes + s.cumPixels / PX_PER_MINUTE;
};
