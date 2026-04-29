import { createEffect, createSignal, on, onCleanup, type Accessor } from "solid-js";
import { isRotating, mergedVisible } from "./state";
import { requestChronostasis } from "../../lib/chronostasis";

/**
 * かさね (merged) / わける (split) 切替時のトランジション支援。
 *
 * Public API:
 *   - useMergeAnimation: { mergedVisible, transitioning, mergedRevealed } を返す
 *   - useButtonsDimmedDuringMergeFlip: SettingsPanel 専用 (周辺ボタン dim 用)
 *   - 純関数: amTransform, pmTransform, mergedTransform, splitShadow
 *
 * mergedVisible は state.ts 側 (isRotating との AND ガード済み accessor)。本モジュールはそれを
 * 観測して transitioning フラグを 620ms 立ち下げ + mergedRevealed (rising edge だけ double rAF
 * 遅延) を作る。
 *
 * mergedRevealed が要る理由: merged container は <Show when={mergedVisible() || transitioning()}> で
 * mount/unmount され、「わけ」が 620ms 以上続くと unmount される。そこから「かさねる」を押すと
 * fresh mount され opacity=1/scale=1 (最終状態) で生まれる。CSS transition は「前の computed style
 * との差分」で発火するので、前の style を持たない fresh mount では transition が走らない。
 * 一旦 opacity=0/scale=0.55 で mount → 1 frame paint → reveal に切替の流れにすることで
 * browser に initial state を認識させてから transition を起こす。double rAF は paint を 1 回確実に
 * 挟むための保険 (single rAF だと paint 前に値変更を踏む browser 実装がある)。
 */

const TRANSITION_DURATION_MS = 620;

export const useMergeAnimation = () => {
  const [transitioning, setTransitioning] = createSignal(false);
  const [mergedRevealed, setMergedRevealed] = createSignal(mergedVisible());
  let timer: ReturnType<typeof setTimeout> | undefined;
  let revealRaf1: number | null = null;
  let revealRaf2: number | null = null;

  const cancelReveal = () => {
    if (revealRaf1 !== null) {
      cancelAnimationFrame(revealRaf1);
      revealRaf1 = null;
    }
    if (revealRaf2 !== null) {
      cancelAnimationFrame(revealRaf2);
      revealRaf2 = null;
    }
  };

  createEffect(
    on(
      mergedVisible,
      (curr, prev) => {
        if (prev === undefined) return;
        // mergedVisible は clockMode を transitively tracking するため、freeRotate <-> autoRotate
        // 遷移でも callback が走ってしまう。値が同じなら何もしない (unwanted chronostasis を防ぐ)。
        if (curr === prev) return;
        setTransitioning(true);
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => setTransitioning(false), TRANSITION_DURATION_MS);

        cancelReveal();
        if (curr) {
          // rising edge: 1 frame paint させてから reveal して CSS transition を起こす。
          revealRaf1 = requestAnimationFrame(() => {
            revealRaf1 = null;
            revealRaf2 = requestAnimationFrame(() => {
              revealRaf2 = null;
              setMergedRevealed(true);
            });
          });
        } else {
          // falling edge: 即座 false。CSS が前フレーム (opacity=1) との差分を拾って transition 起動。
          setMergedRevealed(false);
        }
      },
    ),
  );

  /** transition 中は chronostasis を要求し、下層 tick (useCurrentTime / auto-rotate / Star twinkle) を
   *  一斉停止する → wrapper opacity フェードと merged container アニメに合成資源を全振りさせる。 */
  createEffect(
    on(transitioning, (held) => {
      if (!held) return;
      const release = requestChronostasis();
      onCleanup(release);
    }),
  );

  onCleanup(() => {
    if (timer) clearTimeout(timer);
    cancelReveal();
  });

  return { mergedVisible, transitioning, mergedRevealed };
};

export const amTransform = (mergedVisible: boolean, isLandscape: boolean): string => {
  if (!mergedVisible) return "translate(0, 0) scale(1)";
  return isLandscape
    ? "translateX(50%) scale(0.96)"
    : "translateY(50%) scale(0.96)";
};

export const pmTransform = (mergedVisible: boolean, isLandscape: boolean): string => {
  if (!mergedVisible) return "translate(0, 0) scale(1)";
  return isLandscape
    ? "translateX(-50%) scale(0.96)"
    : "translateY(-50%) scale(0.96)";
};

export const mergedTransform = (mergedVisible: boolean): string =>
  mergedVisible ? "scale(1)" : "scale(0.55)";

export const splitShadow = (transitioning: boolean): string =>
  transitioning ? "drop-shadow(0 6px 26px rgba(40,28,90,0.35))" : "none";

/**
 * かさね/わけ切替時に周辺ボタンを薄く退避させる SettingsPanel 専用 hook。
 * isRotating 自体の出入りで mergedVisible が動いた時 (= モード遷移) は無視し、
 * freeRotate 中の merged トグルだけで dim 起動する。
 */
export const useButtonsDimmedDuringMergeFlip = (): Accessor<boolean> => {
  const [dimmed, setDimmed] = createSignal(false);
  let timer: ReturnType<typeof setTimeout> | undefined;
  let prevActive = isRotating();

  createEffect(
    on(
      mergedVisible,
      (curr, prev) => {
        const currActive = isRotating();
        const activeChanged = currActive !== prevActive;
        prevActive = currActive;
        if (prev === undefined) return;
        // freeRotate <-> autoRotate 遷移で mergedVisible callback が誤発火するのを弾く
        // (mergedVisible は clockMode を transitively tracking しているため)。
        if (curr === prev) return;
        if (activeChanged) return;
        setDimmed(true);
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => setDimmed(false), TRANSITION_DURATION_MS);
      },
    ),
  );

  onCleanup(() => {
    if (timer) clearTimeout(timer);
  });

  return dimmed;
};
