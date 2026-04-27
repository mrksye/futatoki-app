/**
 * 自由回転のマウスホイール操作スタイル。drag.ts / crank.ts と並ぶ純関数モジュール。
 *
 * 下方向スクロール (deltaY > 0) のみ「進める」、上方向 (deltaY < 0) は「針は右回りのみ」原則に揃える
 * ため時計を動かさず resist 通知のみ返す。deltaY = 0 (横スクロール only / trackpad の慣性 0 frame
 * 等) は ignore。WheelEvent.deltaMode を pixel に正規化して device 差を吸収する。
 */

/** WheelEvent.deltaMode の各値を pixel 換算するための係数。 */
const LINE_HEIGHT_PX = 16;
const PAGE_HEIGHT_PX = 800;

/** 何 pixel 相当のホイール量で 1 分進めるか。「12 ノッチで 12 分 (1 時間)」の直感に合わせる
 *  (Windows mouse の 1 ノッチ ≈ deltaY 100 で 1 分、Mac trackpad の gentle gesture で 0.3〜0.5 分)。
 *  実 minute 反映は ClockLayout 側で rAF tween するので飛ばずに滑らかに動く。 */
export const WHEEL_DELTA_PER_MINUTE = 100;

export type WheelAdvanceResult =
  | { kind: "advance"; minutesDelta: number }
  | { kind: "resist" }
  | { kind: "ignore" };

export const wheelAdvance = (e: WheelEvent): WheelAdvanceResult => {
  const px =
    e.deltaMode === 1 ? e.deltaY * LINE_HEIGHT_PX :
    e.deltaMode === 2 ? e.deltaY * PAGE_HEIGHT_PX :
    e.deltaY;
  if (px === 0) return { kind: "ignore" };
  if (px < 0) return { kind: "resist" };
  return { kind: "advance", minutesDelta: px / WHEEL_DELTA_PER_MINUTE };
};
