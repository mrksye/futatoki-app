import { createEffect, createSignal, on, onCleanup, type Accessor } from "solid-js";
import { useAmPmPreviewHold as useBaseAmPmPreviewHold } from "../am-pm-preview";
import { isRotating } from "../free-rotation/state";

/**
 * 【デバッグ専用】 AM/PM プレビューバッジを 2 連タップすると flip 状態をロック (押し続けなくても
 * 反転表示が固定)。再度ダブルタップで解除。ロック中は #root 背景を濃い青に上書きして識別可能にし、
 * 付けっぱなし防止のため AUTO_RELEASE_MS で自動解除する。
 *
 * ダブル判定は pointerdown 同士の間隔のみで行う (1 回目の up を待たず 2 回目の down で確定)。
 *
 * 【削除方法】ClockLayout.tsx の import を本ファイルから "../features/am-pm-preview" へ戻すと、
 * 本ファイルはどこからも参照されなくなるのでそのまま削除可能。
 */

const DOUBLE_TAP_MS = 320;
const LOCKED_BODY_CLASS = "ampm-preview-locked";
/** ロック中の背景。元の暖色パステルグラデと色相が違うので普通モードと取り違えない濃い青。 */
const LOCKED_BG_COLOR = "#1e3a8a";
/** 付けっぱなし防止の自動解除時間。 */
const AUTO_RELEASE_MS = 60 * 1000;

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
  let autoReleaseTimer: ReturnType<typeof setTimeout> | null = null;

  const cancelAutoRelease = () => {
    if (autoReleaseTimer !== null) {
      clearTimeout(autoReleaseTimer);
      autoReleaseTimer = null;
    }
  };

  injectStyleOnce();

  /** ロック中だけ body class を toggle して #root 背景を青に切替える。 */
  createEffect(() => {
    if (typeof document === "undefined") return;
    document.body.classList.toggle(LOCKED_BODY_CLASS, locked());
  });

  /** 回転モード (freeRotate / autoRotate) に入ったらロックを強制解除。
   *  rotation 中は AM/PM プレビューバッジ自体が出ないので、ロック状態のまま戻ると
   *  clock 復帰時に flip だけ残って混乱するのを防ぐ。 */
  createEffect(on(isRotating, (rotating) => {
    if (!rotating) return;
    if (!locked()) return;
    cancelAutoRelease();
    setLocked(false);
    base.clearHold();
  }, { defer: true }));

  onCleanup(() => {
    cancelAutoRelease();
    if (typeof document !== "undefined") {
      document.body.classList.remove(LOCKED_BODY_CLASS);
    }
  });

  const startHold = () => {
    const now = performance.now();
    if (now - lastDownAt <= DOUBLE_TAP_MS) {
      const willLock = !locked();
      setLocked(willLock);
      // 解除/再ロック どちらでも進行中の auto-release は破棄。再ロックなら新しい 1 分を測り直す。
      cancelAutoRelease();
      if (willLock) {
        autoReleaseTimer = setTimeout(() => {
          autoReleaseTimer = null;
          setLocked(false);
          // auto-release は pointer イベントなしで発火するので、明示的に base.clearHold を呼ばないと
          // 背景だけ戻って flip だけ残る。
          base.clearHold();
        }, AUTO_RELEASE_MS);
      }
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
