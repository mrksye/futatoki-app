import { createSignal, createEffect, createRoot, on } from "solid-js";
import { rotateActive } from "./state";

/**
 * 手回し (てまわし / crank) 操作スタイル。
 * 自由回転モードの manual サブモードのドラッグ操作スタイル2種のうちの一つ。
 * 角度の累積で時刻を進める。CW (時計回り) に最大角まで進めた値だけ反映、
 * 戻りは無視するワンウェイ累積。
 *
 * Public API:
 *   - accessor: rotateStyle
 *   - action:   toggleRotateStyle
 *   - 操作:     CrankDragState, crankStart, crankAdvance
 *
 * 内部の生 setter (setStyleRaw) は意図的に export していない。
 * モジュール内でも生 setter を直接呼ばず、必ず action 経由で書き換えること。
 *
 * このモジュールは drag style と相互排他。drag のみで運用したくなったら、
 * このファイルを import している箇所 (ClockLayout / SettingsPanel) の
 * crank 関連ブロックをコメントアウトすれば機能ごと外せる。
 */

/** 自由回転の操作スタイル: crank=角度CW限定 (てまわし), drag=距離ベース (ぐりぐり) */
export type RotateStyle = "crank" | "drag";

// ===== Internal state =====
const [rotateStyle, setStyleRaw] = createSignal<RotateStyle>("drag");

// 自由回転モードに入るたびに drag に戻す。
// (前回 crank に切り替えた状態が残っていると、再入時にユーザーが戸惑うため)
createRoot(() => {
  createEffect(on(rotateActive, (active) => {
    if (active) setStyleRaw("drag");
  }, { defer: true }));
});

// ===== Public accessor =====
export { rotateStyle };

// ===== Public actions =====
export const toggleRotateStyle = () =>
  setStyleRaw(s => s === "crank" ? "drag" : "crank");

// ===== ドラッグ操作の handler =====
// (state を持つので type + 純関数の組で公開。ClockLayout が dragRef に保持して使う)

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

/**
 * ポインタ移動時に呼ぶ。state を破壊的に更新し、
 * 「rotateMinutes に反映すべき新しい値」を返す。更新不要なら null。
 * (累積が現在最大角を超えた時のみ前進。CW one-way の挙動)
 */
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
