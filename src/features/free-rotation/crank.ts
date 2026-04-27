import { createSignal, createEffect, createRoot, on } from "solid-js";
import { rotateActive } from "./state";

/**
 * 手回し (てまわし / crank) 操作スタイル。manual サブモードのドラッグ操作スタイル 2 種の一つで、
 * CW に最大角まで進めた値だけ反映、戻りは無視するワンウェイ累積。drag style と相互排他で、外したい
 * 場合は ClockLayout / SettingsPanel の crank 関連ブロックをコメントアウトすれば機能ごと外せる。
 *
 * 内部の生 setter (setStyleRaw) は未 export。モジュール内でも action (toggleRotateStyle) 経由で書く。
 */

/** 自由回転の操作スタイル: crank=角度 CW 限定 (てまわし), drag=距離ベース (ぐりぐり)。 */
export type RotateStyle = "crank" | "drag";

const [rotateStyle, setStyleRaw] = createSignal<RotateStyle>("drag");

// 自由回転モードに入るたびに drag に戻す (前回 crank の状態が残ると再入時にユーザーが戸惑う)。
createRoot(() => {
  createEffect(on(rotateActive, (active) => {
    if (active) setStyleRaw("drag");
  }, { defer: true }));
});

export { rotateStyle };

export const toggleRotateStyle = () =>
  setStyleRaw(s => s === "crank" ? "drag" : "crank");

export type CrankDragState = {
  pivotX: number;
  pivotY: number;
  lastAngle: number;
  cumulative: number;
  maxAngle: number;
  startMinutes: number;
  pointerId: number;
};

/** ポインタ押下時に呼ぶ。pivot は近い側のクロック中心。 */
export const crankStart = (
  e: PointerEvent,
  pivot: { cx: number; cy: number },
  startMinutes: number,
): CrankDragState => {
  const a = (Math.atan2(e.clientY - pivot.cy, e.clientX - pivot.cx) * 180) / Math.PI;
  return {
    pivotX: pivot.cx,
    pivotY: pivot.cy,
    lastAngle: a,
    cumulative: 0,
    maxAngle: 0,
    startMinutes,
    pointerId: e.pointerId,
  };
};

/** ポインタ移動時に呼ぶ。state を破壊的に更新し、rotateMinutes に反映すべき新しい値を返す
 *  (更新不要なら null。累積が現在最大角を超えた時のみ前進する CW one-way の挙動)。 */
export const crankAdvance = (
  e: PointerEvent,
  s: CrankDragState,
): number | null => {
  const a = (Math.atan2(e.clientY - s.pivotY, e.clientX - s.pivotX) * 180) / Math.PI;
  let delta = a - s.lastAngle;
  while (delta > 180) delta -= 360;
  while (delta < -180) delta += 360;
  s.cumulative += delta;
  s.lastAngle = a;
  if (s.cumulative > s.maxAngle) {
    s.maxAngle = s.cumulative;
    return s.startMinutes + s.maxAngle / 6;
  }
  return null;
};
