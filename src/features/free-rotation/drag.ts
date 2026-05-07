/**
 * ぐりぐり (drag) 操作スタイル。manual サブモードのドラッグ操作スタイル 2 種の一つで、ポインタ移動の
 * 累積ピクセル数を分に変換して時刻を進める。状態は呼び出し側 (ClockLayout の dragRef) が保持し、
 * このモジュールは純関数のみ。crank.ts と相互排他で drag が default。
 *
 * 何ピクセルで 1 分進めるかは viewport の対角線長に線形比例。スマホ実機 (~900px 対角) で 6 px/min
 * が良い感触だったので、その比を保って「対角線フルドラッグ ≒ 150 分」を画面サイズ非依存に固定する。
 * PC / タブレットの大画面でついうっかり進みすぎる問題への対処。dragStart 時の値を state に capture
 * してドラッグ中は固定 (途中で resize / アドレスバー伸縮に追従して感度がブレる方が嫌なので)。
 *
 * 速度 gain は VelocityGainCurve (velocity アンカー列 × gain アンカー列の piecewise linear) として
 * 宣言。現行 curve は ACTIVE_GAIN_CURVE で名指し (差し替えポイント明示)。velocity アンカーは
 * reference diagonal 基準で持ち、実機の viewportScale を掛けて正規化する。
 *
 * raw velocity は pointermove の dt 揺らぎや coalesce で bumpy なので EMA で平滑化して使う。
 * dragStart 直後は smoothed=0 から立ち上がるので、最初の 1, 2 event は鈍い感触になるが、5 event 程度で
 * 実 velocity に追従する (60Hz で ~80ms)。これは「弾みでブッ飛ばさない」性質に効く (intent 検出として機能)。
 */

const REFERENCE_DIAGONAL_PX = 900;
const REFERENCE_PX_PER_MINUTE = 6;

const VELOCITY_EMA_ALPHA = 0.35;

type VelocityGainCurve = {
  readonly velocitiesPxPerMsAtReference: readonly number[];
  readonly gains: readonly number[];
};

const FOUR_STOP_LOW_SPEED_CUSHIONED_CURVE: VelocityGainCurve = {
  velocitiesPxPerMsAtReference: [0.1, 0.5, 1.0, 2.0],
  gains:                         [0.25, 0.5, 1.0, 2.0],
};

const ACTIVE_GAIN_CURVE = FOUR_STOP_LOW_SPEED_CUSHIONED_CURVE;

const computeViewportScale = (): number => {
  if (typeof window === "undefined") return 1;
  const diagonal = Math.hypot(window.innerWidth, window.innerHeight);
  return diagonal / REFERENCE_DIAGONAL_PX;
};

const computePxPerMinute = (viewportScale: number): number =>
  REFERENCE_PX_PER_MINUTE * viewportScale;

const interpolateVelocityGain = (
  smoothedPxPerMs: number,
  curve: VelocityGainCurve,
  viewportScale: number,
): number => {
  const { velocitiesPxPerMsAtReference: vs, gains } = curve;
  const n = vs.length;
  const firstV = vs[0]! * viewportScale;
  const firstG = gains[0]!;
  if (smoothedPxPerMs <= firstV) return firstG;
  const lastV = vs[n - 1]! * viewportScale;
  const lastG = gains[n - 1]!;
  if (smoothedPxPerMs >= lastV) return lastG;
  for (let i = 0; i < n - 1; i++) {
    const upperV = vs[i + 1]! * viewportScale;
    if (smoothedPxPerMs <= upperV) {
      const lowerV = vs[i]! * viewportScale;
      const t = (smoothedPxPerMs - lowerV) / (upperV - lowerV);
      const lowerG = gains[i]!;
      const upperG = gains[i + 1]!;
      return lowerG + t * (upperG - lowerG);
    }
  }
  return lastG;
};

export type DragDragState = {
  lastX: number;
  lastY: number;
  /** 直近 pointermove の event.timeStamp (ms)。velocity の dt 計算に使う。 */
  lastTimeStamp: number;
  cumPixels: number;
  startMinutes: number;
  pointerId: number;
  /** dragStart 時にスナップした px/min。viewport 対角線長から導出。 */
  pxPerMinute: number;
  /** dragStart 時にスナップした viewport スケール。velocity 閾値の正規化用。 */
  viewportScale: number;
  /** EMA で平滑化したポインタ速度 (px/ms)。dragStart 直後は 0 から立ち上げる。 */
  smoothedVelocity: number;
};

/** ポインタ押下時に呼ぶ。 */
export const dragStart = (
  e: PointerEvent,
  startMinutes: number,
): DragDragState => {
  const viewportScale = computeViewportScale();
  return {
    lastX: e.clientX,
    lastY: e.clientY,
    lastTimeStamp: e.timeStamp,
    cumPixels: 0,
    startMinutes,
    pointerId: e.pointerId,
    pxPerMinute: computePxPerMinute(viewportScale),
    viewportScale,
    smoothedVelocity: 0,
  };
};

/** ポインタ移動時に呼ぶ。state を破壊的に更新し、rotateMinutes に反映すべき新しい値を返す。 */
export const dragAdvance = (
  e: PointerEvent,
  s: DragDragState,
): number => {
  const dx = e.clientX - s.lastX;
  const dy = e.clientY - s.lastY;
  const distance = Math.hypot(dx, dy);
  /** dt 0 (同一 timestamp の coalesced イベント等) は instantVelocity 発散するので 1ms floor。 */
  const dt = Math.max(1, e.timeStamp - s.lastTimeStamp);
  const instantVelocity = distance / dt;
  s.smoothedVelocity =
    VELOCITY_EMA_ALPHA * instantVelocity + (1 - VELOCITY_EMA_ALPHA) * s.smoothedVelocity;
  const gain = interpolateVelocityGain(s.smoothedVelocity, ACTIVE_GAIN_CURVE, s.viewportScale);
  s.cumPixels += distance * gain;
  s.lastX = e.clientX;
  s.lastY = e.clientY;
  s.lastTimeStamp = e.timeStamp;
  return s.startMinutes + s.cumPixels / s.pxPerMinute;
};
