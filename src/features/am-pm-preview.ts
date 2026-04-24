import { createMemo, createSignal, onCleanup, type Accessor } from "solid-js";

/**
 * AM/PM バッジの長押しプレビュー: バッジを押している間だけ反対側 (AM↔PM) を表示する。
 *
 * Public API:
 *   - hook: useAmPmPreviewHold (actualIsAm accessor を渡し、{ isAm, startHold, clearHold } を受け取る)
 *
 * onCleanup を持つので呼び出し側は reactive owner (= component setup) の中で呼ぶこと。
 *
 * "押している間だけ flip" の状態 (flipped) は外に出さない。
 * 表示用の isAm だけ accessor として公開する。
 */

export const useAmPmPreviewHold = (actualIsAm: Accessor<boolean>) => {
  const [flipped, setFlipped] = createSignal(false);

  const startHold = () => setFlipped(true);
  const clearHold = () => setFlipped(false);

  onCleanup(clearHold);

  const isAm = createMemo(() => flipped() ? !actualIsAm() : actualIsAm());

  return { isAm, startHold, clearHold };
};
