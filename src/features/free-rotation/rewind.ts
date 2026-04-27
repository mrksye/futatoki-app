import { onCleanup } from "solid-js";
import { rotateMinutes, seekRotate } from "./state";

/**
 * 1 ふんもどす: タップで -1 分、長押しで連続。HOLD_DELAY_MS 押し続けると REPEAT_INTERVAL_MS 間隔で
 * 連続発火、指離し / pointercancel で停止。小数値 (自動回転や drag 経由) でも整数分目盛りに揃えて -1 する。
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
