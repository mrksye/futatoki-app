/**
 * じゆうかいてん (free rotation) の マウスホイール操作スタイル。
 * drag.ts / crank.ts と並ぶ pure logic モジュール (state を持たない)。
 * 呼び出し側 = ClockLayout が wheel event を受けて wheelAdvance に渡し、
 * 戻り値で seekRotate と抵抗フィードバックをそれぞれ駆動する。
 *
 * Public API:
 *   - WheelAdvanceResult
 *   - wheelAdvance
 *   - WHEEL_DELTA_PER_MINUTE
 *
 * 設計判断:
 *   - 下方向スクロール (deltaY > 0) のみ「進める」。上方向 (deltaY < 0) は
 *     反対回転扱いで時計を動かさず resist 通知だけ返す。LP / SettingsPanel
 *     でも明文化された「針は右回りのみ」原則に揃えるため。
 *   - deltaY = 0 の event (横スクロール only や trackpad の慣性 0 frame 等)
 *     は no-op として resist にも advance にも振らず ignore 用の値を返す。
 *   - WheelEvent.deltaMode を pixel に正規化して device 差を吸収する。
 */

/** WheelEvent.deltaMode の各値を pixel 換算するための係数 */
const LINE_HEIGHT_PX = 16;
const PAGE_HEIGHT_PX = 800;

/** 何 pixel 相当のホイール量で 1 分進めるか。
 *  Windows mouse の 1 ノッチ ≈ deltaY 100 → 1 分進める想定。
 *  Mac trackpad の gentle gesture (~30-50 deltaY) で 0.3-0.5 分。
 *  「12 ノッチで 12 分 (= 1 時間)」が直感に近い感覚。
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
