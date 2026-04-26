import { createEffect, createSignal, onCleanup, type Accessor } from "solid-js";
import { useAmPmPreviewHold as useBaseAmPmPreviewHold } from "../am-pm-preview";

/**
 * 【デバッグ専用】 AM/PM プレビューバッジを素早く 2 連タップすると flip 状態をロックする
 * (押し続けなくても反転表示が固定)。もう 1 度ダブルタップで解除。ロック中はアプリ全体の
 * 背景が濃い赤になり、いま反転固定中であることが一目で分かる。
 *
 * 内部実装:
 *   本体 useAmPmPreviewHold をラップし、startHold で pointerdown 間隔を計測。
 *   DOUBLE_TAP_MS 以内なら locked を toggle。clearHold は locked 中だけ no-op に差し替え。
 *   ロック中だけ document.body に LOCKED_BODY_CLASS を付与し、style タグ (1 度だけ注入) で
 *   #root の背景を濃い赤に上書きする。注入は import されないと走らないので、本ファイルを
 *   使わなくなれば style も class も完全に dormant。
 *
 * pointerup → pointerdown が高速で並ぶ pointer イベント特性に合わせ、ダブル判定は
 * pointerdown 同士の間隔だけで行う (= 1 回目の up を待たず、2 回目の down が来た瞬間に確定)。
 *
 * 【削除方法】 (1 行レベル)
 *   ClockLayout.tsx の import を `from "../features/debug/am-pm-preview-lock"` から
 *   `from "../features/am-pm-preview"` に戻す。本ファイルは以後どこからも import されないので、
 *   そのまま削除して完了。
 */

const DOUBLE_TAP_MS = 320;
const LOCKED_BODY_CLASS = "ampm-preview-locked";
const LOCKED_BG_COLOR = "#7a0000";

let styleInjected = false;
const injectStyleOnce = () => {
  if (styleInjected) return;
  if (typeof document === "undefined") return;
  styleInjected = true;
  const tag = document.createElement("style");
  tag.dataset.debug = "ampm-preview-lock";
  // #root の既存グラデを完全に上書きするため !important。
  tag.textContent = `body.${LOCKED_BODY_CLASS} #root { background: ${LOCKED_BG_COLOR} !important; }`;
  document.head.appendChild(tag);
};

export const useAmPmPreviewHold = (actualIsAm: Accessor<boolean>) => {
  const base = useBaseAmPmPreviewHold(actualIsAm);
  const [locked, setLocked] = createSignal(false);
  let lastDownAt = 0;

  injectStyleOnce();

  createEffect(() => {
    if (typeof document === "undefined") return;
    document.body.classList.toggle(LOCKED_BODY_CLASS, locked());
  });

  onCleanup(() => {
    if (typeof document !== "undefined") {
      document.body.classList.remove(LOCKED_BODY_CLASS);
    }
  });

  const startHold = () => {
    const now = performance.now();
    if (now - lastDownAt <= DOUBLE_TAP_MS) {
      setLocked((prev) => !prev);
    }
    lastDownAt = now;
    base.startHold();
  };

  const clearHold = () => {
    // ロック中は離しても元に戻さない (押下なしで反転表示が固定される本体)。
    if (locked()) return;
    base.clearHold();
  };

  return { isAm: base.isAm, startHold, clearHold };
};
