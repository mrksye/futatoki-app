import { createEffect, on, onCleanup, untrack } from "solid-js";
import { rotateActive, rotateMinutes, rotateMode, seekRotate } from "./state";

/**
 * 自動回転 (じどうかいてん): 1日 ≒ 24 秒で時刻を進める。
 * requestAnimationFrame で毎フレーム少しずつ rotateMinutes を進める。
 *
 * Public API:
 *   - hook: useAutoRotateTick (コンポーネント内で1回呼ぶ)
 *
 * lifecycle が必要なため hook 形式で公開。createEffect / onCleanup を持つので
 * 呼び出し側は reactive owner (= component setup) の中で呼ぶこと。
 */

const MIN_PER_MS = 1440 / 24000;

/**
 * 自由回転モード & mode==="auto" の間だけ requestAnimationFrame で
 * rotateMinutes を進める。コンポーネント内で1回呼ぶだけで、
 * ON/OFF 切り替えと cleanup は自動で処理される。
 */
export const useAutoRotateTick = () => {
  createEffect(
    on(
      () => rotateActive() && rotateMode() === "auto",
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
