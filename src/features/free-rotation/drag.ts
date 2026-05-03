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
 * 速度 gain (bimodal): 「1 分単位で精密に合わせる」と「思いっきりスキップする」の二極を速度で
 * 表現する。低速は gain<1 で 1px の効きを減らして精密合わせを楽にし、高速は gain>1 でフリック
 * のスキップを強調する。中速 (普通の drag) は gain=1 で従来感。閾値は viewport diagonal に比例
 * させて画面サイズ非依存に揃える (大画面でも小画面でも同じ "速さ感" で zone が切り替わる)。
 *
 * 単純な「速ければ純増」モデル (= gain >= 1 のみ) だと、低速の精密モードが分離されず体感的に
 * ただの感度ブレに近くなる。0.5 (超低速) → 1.0 (中速) → 2.0 (高速) の 3 zone 線形補間で
 * 「飛ばすか / 止めるか」の意図を速度に対応付ける。
 *
 * raw velocity は pointermove の dt 揺らぎや coalesce で bumpy なので EMA で平滑化して使う。
 * dragStart 直後は smoothed=0 (= 超低速 zone = gain 0.5) から立ち上がるので、最初の 1, 2 event は
 * 鈍い感触になるが、5 event 程度で実 velocity に追従する (60Hz で ~80ms)。これは「弾みで
 * ブッ飛ばさない」性質に効く (intent 検出として機能)。
 */

const REFERENCE_DIAGONAL_PX = 900;
const REFERENCE_PX_PER_MINUTE = 6;

const VELOCITY_EMA_ALPHA = 0.35;
/** 3 zone の境界閾値 (px/ms @ reference diagonal)。超低速以下は MIN_GAIN 固定、中速で 1.0、
 *  高速以上は MAX_GAIN 固定、間は線形補間。100 px/sec = なぞる程の速度、500 px/sec = 普通に
 *  指を動かす速度、2000 px/sec = フリック。 */
const VERY_SLOW_THRESHOLD_PX_PER_MS_REFERENCE = 0.1;
const SLOW_THRESHOLD_PX_PER_MS_REFERENCE = 0.5;
const FAST_THRESHOLD_PX_PER_MS_REFERENCE = 2.0;
const MIN_VELOCITY_GAIN = 0.5;
const MAX_VELOCITY_GAIN = 2.0;

const computeViewportScale = (): number => {
  if (typeof window === "undefined") return 1;
  const diagonal = Math.hypot(window.innerWidth, window.innerHeight);
  return diagonal / REFERENCE_DIAGONAL_PX;
};

const computePxPerMinute = (viewportScale: number): number =>
  REFERENCE_PX_PER_MINUTE * viewportScale;

const computeVelocityGain = (smoothedPxPerMs: number, viewportScale: number): number => {
  const verySlow = VERY_SLOW_THRESHOLD_PX_PER_MS_REFERENCE * viewportScale;
  const slow = SLOW_THRESHOLD_PX_PER_MS_REFERENCE * viewportScale;
  const fast = FAST_THRESHOLD_PX_PER_MS_REFERENCE * viewportScale;
  if (smoothedPxPerMs <= verySlow) return MIN_VELOCITY_GAIN;
  if (smoothedPxPerMs >= fast) return MAX_VELOCITY_GAIN;
  if (smoothedPxPerMs <= slow) {
    const t = (smoothedPxPerMs - verySlow) / (slow - verySlow);
    return MIN_VELOCITY_GAIN + t * (1 - MIN_VELOCITY_GAIN);
  }
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
