import { onCleanup } from "solid-js";
import { rotateMinutes, seekRotate } from "./state";

/**
 * 1ふんもどす: タップで -1 分、長押しで連続。
 *
 * Public API:
 *   - hook: useRewindHold (コンポーネント内で1回呼ぶ。{ start, stop } を返す)
 *
 * onCleanup を持つので呼び出し側は reactive owner (= component setup) の中で呼ぶこと。
 *
 * 仕様: 250ms 押し続けると 40ms 間隔で連続発火。指離し / pointercancel で停止。
 *       小数値 (自動回転やドラッグ経由) でも整数の分目盛りに揃えてから -1 する。
 */

const HOLD_DELAY_MS = 250;
const REPEAT_INTERVAL_MS = 40;

export const useRewindHold = () => {
  let holdTimer: ReturnType<typeof setTimeout> | undefined;
  let repeatInterval: ReturnType<typeof setInterval> | undefined;

  const tick = () => seekRotate(Math.ceil(rotateMinutes()) - 1);

  const stop = () => {
    if (holdTimer) { clearTimeout(holdTimer); holdTimer = undefined; }
    if (repeatInterval) { clearInterval(repeatInterval); repeatInterval = undefined; }
  };

  const start = (e: PointerEvent) => {
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    tick();
    holdTimer = setTimeout(() => {
      repeatInterval = setInterval(tick, REPEAT_INTERVAL_MS);
    }, HOLD_DELAY_MS);
  };

  onCleanup(stop);

  return { start, stop };
};
