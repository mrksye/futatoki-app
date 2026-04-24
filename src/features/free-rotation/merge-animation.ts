import { createEffect, createMemo, createSignal, on, onCleanup, type Accessor } from "solid-js";
import { rotateActive, rotateMerged } from "./state";

/**
 * かさね (merged) / わける (split) 切替時のトランジション支援。
 *
 * Public API:
 *   - hook:        useMergeAnimation ({ mergedVisible, transitioning } を返す)
 *   - hook:        useButtonsDimmedDuringMergeFlip (SettingsPanel 専用)
 *   - 計算ヘルパー: amTransform, pmTransform, mergedTransform, splitShadow
 *
 * 「見た目として重ねになっているか」は rotateActive && rotateMerged で判定する
 * (通常モードでは merged フラグの値に関係なく普通の時計表示にしたいため)。
 *
 * transitioning フラグは 620ms (CSS の transition と同期) 立ち、
 * 切替アニメ中の "影→分身" 表現や周辺ボタンの dim 制御に使われる。
 */

const TRANSITION_DURATION_MS = 620;

export const useMergeAnimation = () => {
  const mergedVisible = createMemo(() => rotateActive() && rotateMerged());
  const [transitioning, setTransitioning] = createSignal(false);
  let timer: ReturnType<typeof setTimeout> | undefined;

  createEffect(
    on(
      mergedVisible,
      (_curr, prev) => {
        if (prev === undefined) return;
        setTransitioning(true);
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => setTransitioning(false), TRANSITION_DURATION_MS);
      },
    ),
  );

  onCleanup(() => {
    if (timer) clearTimeout(timer);
  });

  return { mergedVisible, transitioning };
};

// ===== transform / filter 計算ヘルパー (純関数) =====

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
 * かさね/わけ切替時に他のボタンを薄く退避させたいケース用の hook。
 * (rotateActive 自体の切替時は無視する。merged 単独切替の時だけ立つ)
 *
 * SettingsPanel 専用ヘルパー。
 */
export const useButtonsDimmedDuringMergeFlip = (): Accessor<boolean> => {
  const [dimmed, setDimmed] = createSignal(false);
  let timer: ReturnType<typeof setTimeout> | undefined;
  let prevActive = rotateActive();

  createEffect(
    on(
      rotateMerged,
      (_curr, prev) => {
        const currActive = rotateActive();
        const activeChanged = currActive !== prevActive;
        prevActive = currActive;
        if (prev === undefined) return;
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
