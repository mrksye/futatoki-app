import { createEffect, createSignal, on, onCleanup, untrack } from "solid-js";
import { clockMode, rotateMinutes, seekRotate } from "./state";
import { useChronostasis } from "../../lib/chronostasis/solid";

/**
 * 自動回転 (じどうかいてん): 1 日 ≒ 24 秒で時刻を進める。requestAnimationFrame で毎フレーム少しずつ
 * rotateMinutes を進める。chronostasis 中は止まる。
 *
 * 盤を押した瞬間に進行が一時停止し、もう一度押すと再生する (モードは じどうかいてん のまま)。
 * 止めた盤はそのまま「いま何時？」を読む問題になるので、眺める → 止める → 読む → また眺める が
 * モードを出入りせずに続けられる。
 */

const MIN_PER_MS = 1440 / 24000;

/** 一時停止中か (生 signal)。じどうかいてん中しか意味を持たないので直接は読ませない。 */
const [pausedValue, setPausedValue] = createSignal(false);

/** じどうかいてんの進行が止まっているか。他モードでは常に false。 */
export const autoRotatePaused = (): boolean =>
  clockMode() === "autoRotate" && pausedValue();

/** 一時停止 / 再生をトグルする。じどうかいてん外では no-op。 */
export const toggleAutoRotatePause = () => {
  if (clockMode() !== "autoRotate") return;
  setPausedValue(paused => !paused);
};

/** clockMode === "autoRotate" の間だけ rAF で rotateMinutes を進める。ON/OFF 切替と cleanup は createEffect が処理。 */
export const useAutoRotateTick = () => {
  const inChronostasis = useChronostasis();

  // じどうかいてんを抜けたら一時停止を解いておく。止めたまま抜けた記憶を持ち越すと、次に入り直した
  // 盤が理由もなく静止した状態で現れてしまう。
  createEffect(
    on(clockMode, (mode) => {
      if (mode !== "autoRotate") setPausedValue(false);
    }),
  );

  createEffect(
    on(
      () => clockMode() === "autoRotate" && !pausedValue() && !inChronostasis(),
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
