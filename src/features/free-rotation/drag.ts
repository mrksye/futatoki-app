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
 * 速度ブースト: ゆっくり指を動かしているときは 1px = 1/pxPerMinute 分の precision を保ち、フリック
 * のように速く動かしたときだけ gain を上げて 1px の重みを増やす。「正確に合わせる」と「ザッと
 * 飛ばす」を同じジェスチャ系で両立するため。閾値は viewport diagonal に比例させて画面サイズ
 * 非依存に揃える (大画面でも小画面でも同じ "速さ感" で boost が立ち上がる)。
 *
 * raw velocity は pointermove の dt 揺らぎや coalesce で bumpy なので EMA で平滑化して使う。
 * dragStart 直後は smoothed=0 から立ち上がるので、最初のフリック前半は gain ≒ 1。これは
 * 「弾みでブッ飛ばさない」良い性質と捉える (intent 検出として機能)。
 */

const REFERENCE_DIAGONAL_PX = 900;
const REFERENCE_PX_PER_MINUTE = 6;

const VELOCITY_EMA_ALPHA = 0.35;
/** 速度ブーストの slow / fast 閾値 (px/ms @ reference diagonal)。slow 以下は gain 1、fast 以上は
 *  MAX_VELOCITY_GAIN、間は線形補間。500 px/sec ≒ ゆっくりなぞる速度、2000 px/sec ≒ 強めの flick。 */
const SLOW_THRESHOLD_PX_PER_MS_REFERENCE = 0.5;
const FAST_THRESHOLD_PX_PER_MS_REFERENCE = 2.0;
const MAX_VELOCITY_GAIN = 2.5;

const computeViewportScale = (): number => {
  if (typeof window === "undefined") return 1;
  const diagonal = Math.hypot(window.innerWidth, window.innerHeight);
  return diagonal / REFERENCE_DIAGONAL_PX;
};

const computePxPerMinute = (viewportScale: number): number =>
  REFERENCE_PX_PER_MINUTE * viewportScale;

const computeVelocityGain = (smoothedPxPerMs: number, viewportScale: number): number => {
  const slow = SLOW_THRESHOLD_PX_PER_MS_REFERENCE * viewportScale;
  const fast = FAST_THRESHOLD_PX_PER_MS_REFERENCE * viewportScale;
  if (smoothedPxPerMs <= slow) return 1;
  if (smoothedPxPerMs >= fast) return MAX_VELOCITY_GAIN;
  const t = (smoothedPxPerMs - slow) / (fast - slow);
  return 1 + t * (MAX_VELOCITY_GAIN - 1);
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
  const gain = computeVelocityGain(s.smoothedVelocity, s.viewportScale);
  s.cumPixels += distance * gain;
  s.lastX = e.clientX;
  s.lastY = e.clientY;
  s.lastTimeStamp = e.timeStamp;
  return s.startMinutes + s.cumPixels / s.pxPerMinute;
};
