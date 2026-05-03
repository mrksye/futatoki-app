/**
 * 自由回転のマウスホイール操作スタイル。drag.ts / crank.ts と並ぶ純関数モジュール (state は呼び出し側で保持)。
 *
 * 下方向スクロール (deltaY > 0) のみ「進める」、上方向 (deltaY < 0) は「針は右回りのみ」原則に揃える
 * ため時計を動かさず resist 通知のみ返す。deltaY = 0 (横スクロール only / trackpad の慣性 0 frame
 * 等) は ignore。WheelEvent.deltaMode を pixel に正規化して device 差を吸収する。
 *
 * 速度ブースト: ノッチをゆっくり回す/トラックパッドを軽くなぞる時は precision 保持 (gain 1)、
 * 高速に連続スクロールしたときだけ gain を上げて 1 イベントの重みを増やす。drag と同じく EMA 平滑化
 * で event 間 dt 揺らぎを吸収。session 終了 (idle) で velocity state はリセットされ、次の session は
 * smoothedVelocity 0 から立ち上がる (前 session の余韻でブースト誤爆しないため)。
 *
 * viewport scale は不要 (wheel deltaY は OS/デバイス由来で viewport 非依存)。
 */

/** WheelEvent.deltaMode の各値を pixel 換算するための係数。 */
const LINE_HEIGHT_PX = 16;
const PAGE_HEIGHT_PX = 800;

/** 何 pixel 相当のホイール量で 1 分進めるか。「12 ノッチで 12 分 (1 時間)」の直感に合わせる
 *  (Windows mouse の 1 ノッチ ≈ deltaY 100 で 1 分、Mac trackpad の gentle gesture で 0.3〜0.5 分)。
 *  実 minute 反映は ClockLayout 側で rAF tween するので飛ばずに滑らかに動く。 */
export const WHEEL_DELTA_PER_MINUTE = 100;

const VELOCITY_EMA_ALPHA = 0.35;
/** 速度ブーストの slow / fast 閾値 (px/ms)。マウスノッチ 1 個 / 200ms ≈ 0.5 (slow 入口)、
 *  ノッチ 1 個 / 20ms ≈ 5.0 (fast = 強めに連射)。トラックパッドは deltaY が連続的に変動するので
 *  自然にこの帯に入る (gentle 0.3〜0.6 / hard flick 3〜6)。 */
const SLOW_THRESHOLD_PX_PER_MS = 0.5;
const FAST_THRESHOLD_PX_PER_MS = 5.0;
const MAX_VELOCITY_GAIN = 4.0;

const computeVelocityGain = (smoothedPxPerMs: number): number => {
  if (smoothedPxPerMs <= SLOW_THRESHOLD_PX_PER_MS) return 1;
  if (smoothedPxPerMs >= FAST_THRESHOLD_PX_PER_MS) return MAX_VELOCITY_GAIN;
  const t =
    (smoothedPxPerMs - SLOW_THRESHOLD_PX_PER_MS) /
    (FAST_THRESHOLD_PX_PER_MS - SLOW_THRESHOLD_PX_PER_MS);
  return 1 + t * (MAX_VELOCITY_GAIN - 1);
};

export type WheelVelocityState = {
  /** 直近 wheel event の event.timeStamp (ms)。null = session 開始前 (= 初回 event)。 */
  lastTimeStamp: number | null;
  /** EMA で平滑化したホイール速度 (px/ms)。 */
  smoothedVelocity: number;
};

export const newWheelVelocityState = (): WheelVelocityState => ({
  lastTimeStamp: null,
  smoothedVelocity: 0,
});

/** session idle で呼ぶ。次の session は smoothedVelocity 0 から再立ち上げ。 */
export const resetWheelVelocity = (s: WheelVelocityState): void => {
  s.lastTimeStamp = null;
  s.smoothedVelocity = 0;
};

export type WheelAdvanceResult =
  | { kind: "advance"; minutesDelta: number }
  | { kind: "resist" }
  | { kind: "ignore" };

export const wheelAdvance = (e: WheelEvent, s: WheelVelocityState): WheelAdvanceResult => {
  const px =
    e.deltaMode === 1 ? e.deltaY * LINE_HEIGHT_PX :
    e.deltaMode === 2 ? e.deltaY * PAGE_HEIGHT_PX :
    e.deltaY;
  if (px === 0) return { kind: "ignore" };
  if (px < 0) return { kind: "resist" };

  // 初回 event は velocity 不明なので gain 1 のまま、timeStamp だけ仕込む。
  if (s.lastTimeStamp === null) {
    s.lastTimeStamp = e.timeStamp;
    return { kind: "advance", minutesDelta: px / WHEEL_DELTA_PER_MINUTE };
  }
  /** dt 0 (同一 timestamp の連続 event 等) は instantVelocity 発散するので 1ms floor。 */
  const dt = Math.max(1, e.timeStamp - s.lastTimeStamp);
  const instantVelocity = px / dt;
  s.smoothedVelocity =
    VELOCITY_EMA_ALPHA * instantVelocity + (1 - VELOCITY_EMA_ALPHA) * s.smoothedVelocity;
  s.lastTimeStamp = e.timeStamp;
  const gain = computeVelocityGain(s.smoothedVelocity);
  return { kind: "advance", minutesDelta: (px * gain) / WHEEL_DELTA_PER_MINUTE };
};
