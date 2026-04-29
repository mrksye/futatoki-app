import { createEffect, on, onCleanup, untrack } from "solid-js";
import { clockMode, rotateMinutes, seekRotate } from "./state";
import { useChronostasis } from "../../lib/chronostasis/solid";

/**
 * 自動回転 (じどうかいてん): 1 日 ≒ 24 秒で時刻を進める。requestAnimationFrame で毎フレーム少しずつ
 * rotateMinutes を進める。chronostasis 中は止まる。
 */

const MIN_PER_MS = 1440 / 24000;

/** clockMode === "autoRotate" の間だけ rAF で rotateMinutes を進める。ON/OFF 切替と cleanup は createEffect が処理。 */
export const useAutoRotateTick = () => {
  const inChronostasis = useChronostasis();
  createEffect(
    on(
      () => clockMode() === "autoRotate" && !inChronostasis(),
      (running) => {
        if (!running) return;
        let last = performance.now();
        let id = 0;
        const tick = (now: number) => {
          const dt = now - last;
          last = now;
          seekRotate(untrack(rotateMinutes) + dt * MIN_PER_MS);
          id = requestAnimationFrame(tick);
        };
        id = requestAnimationFrame(tick);
        onCleanup(() => cancelAnimationFrame(id));
      },
    ),
  );
};
