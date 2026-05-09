import { createEffect, createSignal, untrack } from "solid-js";
import { clockMode, rotateMinutes } from "../free-rotation/state";

/**
 * 隠し要素 (Easter egg): 月と 29 回出会うと、30 回目の出会いが満月になる。30 回目の夜が終わったらリセット、
 * また 29 回出会えば次の 30 回目も満月。長く遊んだ子だけが見つける秘密の体験。
 */

const MOON_VISIBLE_FROM = 18 * 60;
const MOON_VISIBLE_TO = 6 * 60;
const ENCOUNTERS_TO_FULL_MOON = 30;

const isMoonVisible = (totalMinutes: number): boolean =>
  totalMinutes >= MOON_VISIBLE_FROM || totalMinutes < MOON_VISIBLE_TO;

const [armed, setArmed] = createSignal(false);
let encounters = 0;
let prevVisible = false;

export const isFullMoonActive = armed;

export function initFullMoonEasterEgg(): void {
  createEffect(() => {
    const mode = clockMode();
    if (mode === "clock") {
      encounters = 0;
      prevVisible = false;
      if (untrack(armed)) setArmed(false);
      return;
    }

    const visible = isMoonVisible(rotateMinutes());

    if (visible && !prevVisible) {
      encounters += 1;
      if (encounters >= ENCOUNTERS_TO_FULL_MOON) setArmed(true);
    } else if (!visible && prevVisible) {
      if (untrack(armed)) {
        setArmed(false);
        encounters = 0;
      }
    }

    prevVisible = visible;
  });
}
