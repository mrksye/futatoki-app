import { createMemo, createSignal, onCleanup, type Accessor } from "solid-js";
import { motionAllowed } from "../lib/motion";

/**
 * AM/PM バッジの長押しプレビュー: バッジを押している間だけ反対側 (AM↔PM) を表示する。
 *
 * 押下 → 即時 flip、離す → RELEASE_DELAY_MS の余韻 → 380ms フェードで通常表示に戻る、の
 * directional な timing。motion-reduce 時は余韻もスキップして即時解除。
 * "押している間だけ flip" の状態 (flipped) は外に出さず、表示用の isAm だけ公開する。
 */

/** 離した後に flip を保持する余韻 (ms)。離した瞬間にすぐ戻り始めずワンテンポ置く演出用。 */
const RELEASE_DELAY_MS = 160;

export const useAmPmPreviewHold = (actualIsAm: Accessor<boolean>) => {
  const [flipped, setFlipped] = createSignal(false);
  let releaseTimer: ReturnType<typeof setTimeout> | null = null;

  const cancelReleaseTimer = () => {
    if (releaseTimer !== null) {
      clearTimeout(releaseTimer);
      releaseTimer = null;
    }
  };

  const startHold = () => {
    cancelReleaseTimer();
    setFlipped(true);
  };
  const clearHold = () => {
    cancelReleaseTimer();
    if (!motionAllowed()) {
      setFlipped(false);
      return;
    }
    releaseTimer = setTimeout(() => {
      releaseTimer = null;
      setFlipped(false);
    }, RELEASE_DELAY_MS);
  };

  onCleanup(() => {
    cancelReleaseTimer();
    setFlipped(false);
  });

  const isAm = createMemo(() => flipped() ? !actualIsAm() : actualIsAm());

  return { isAm, startHold, clearHold };
};
