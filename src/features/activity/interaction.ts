import { createSignal, createEffect, createRoot, on } from "solid-js";
import { deleteActivityAt, deleteAllActivity, activity } from "./state";
import { motionAllowed } from "../../lib/motion";
import { clockMode } from "../free-rotation/state";
import { pickerOpen } from "./picker";

/**
 * できごとアイコンの削除 UX 状態。
 *
 *   none ──長押し 500ms──> warning ──✕ボタンタップ──> deleting ──アニメ完了──> none
 *                              ├──外タップ──> none
 *                              └──3 秒タイムアウト──> none
 *
 *   none ──りせっと押下──> resetWarning ──いずれかタップ──> resetDeleting ──時刻順 stagger 完了──> none
 *                                ├──外タップ──> none
 *                                └──3 秒タイムアウト──> none
 *
 * グローバル単一状態。生 setter は未 export。resetWarning/resetDeleting は全できごとが対象。
 */

type Interaction =
  | { type: "none" }
  | { type: "warning"; minutes: number }
  | { type: "deleting"; minutes: number }
  | { type: "resetWarning" }
  | { type: "resetDeleting" };

const WARNING_AUTO_CANCEL_MS = 3000;
/** くるくる削除アニメの全体 duration。ActivityLayer の POOF アニメ keyframes と必ず一致させる
 *  (アニメ完了前に data を消すと EventIcon の `<Show when={def()}>` が unmount してアニメが
 *  途切れる)。export して ActivityLayer 側に POOF_DURATION_MS として import させる single source。 */
export const DELETE_ANIMATION_MS = 1500;
/** りせっと削除時の 1 イベントあたり stagger (時刻順)。 */
export const RESET_STAGGER_MS = 50;

const [interaction, setInteractionRaw] = createSignal<Interaction>({ type: "none" });
let warningTimer: ReturnType<typeof setTimeout> | undefined;

export { interaction };

/** 長押し検出時に呼ぶ。warning に入って 3 秒の自動キャンセルタイマを仕込む。 */
export const enterWarning = (minutes: number) => {
  if (warningTimer) clearTimeout(warningTimer);
  setInteractionRaw({ type: "warning", minutes });
  warningTimer = setTimeout(() => {
    const c = interaction();
    if (c.type === "warning" && c.minutes === minutes) {
      setInteractionRaw({ type: "none" });
    }
  }, WARNING_AUTO_CANCEL_MS);
};

/** 外タップやキャンセル時に呼ぶ。warning / resetWarning 中なら none に戻す。 */
export const cancelWarning = () => {
  if (warningTimer) clearTimeout(warningTimer);
  warningTimer = undefined;
  const t = interaction().type;
  if (t === "warning" || t === "resetWarning") {
    setInteractionRaw({ type: "none" });
  }
};

/** ✕ボタンタップ時に呼ぶ。deleting に遷移、アニメ後にデータ削除して none に戻す。
 *  reduce-motion 中はアニメが走らないので待ち時間を 0 にする (アイコンが何も起きずに 900ms 居続け
 *  るのを避けるため)。 */
export const triggerDelete = (minutes: number) => {
  if (warningTimer) clearTimeout(warningTimer);
  warningTimer = undefined;
  setInteractionRaw({ type: "deleting", minutes });
  const delay = motionAllowed() ? DELETE_ANIMATION_MS : 0;
  setTimeout(() => {
    deleteActivityAt(minutes);
    setInteractionRaw({ type: "none" });
  }, delay);
};

/** りせっとボタン押下時に呼ぶ。全できごとを warning 状態にして 3 秒の自動キャンセルタイマを仕込む。
 *  できごとが 0 件なら no-op (caller 側でも非表示にしている前提だが防御的に弾く)。 */
export const enterResetWarning = () => {
  if (Object.keys(activity()).length === 0) return;
  if (warningTimer) clearTimeout(warningTimer);
  setInteractionRaw({ type: "resetWarning" });
  warningTimer = setTimeout(() => {
    if (interaction().type === "resetWarning") {
      setInteractionRaw({ type: "none" });
    }
  }, WARNING_AUTO_CANCEL_MS);
};

/** いずれかのできごと (またはその ✕) をタップした時に呼ぶ。resetDeleting に遷移、最も遅い icon の
 *  poof 完了タイミングで全できごとを一括削除して none に戻す。reduce-motion 中はアニメが走らないので
 *  即座にデータを削除する。 */
export const triggerResetDelete = () => {
  if (warningTimer) clearTimeout(warningTimer);
  warningTimer = undefined;
  setInteractionRaw({ type: "resetDeleting" });
  const eventCount = Object.keys(activity()).length;
  const maxStagger = motionAllowed() ? Math.max(0, eventCount - 1) * RESET_STAGGER_MS : 0;
  const animDuration = motionAllowed() ? DELETE_ANIMATION_MS : 0;
  setTimeout(() => {
    deleteAllActivity();
    setInteractionRaw({ type: "none" });
  }, maxStagger + animDuration);
};

/**
 * warning / resetWarning は freeRotate モード + picker 閉鎖の文脈でしか意味を持たない。
 * 状態がそこを抜けたら強制 none に戻して、stale な ✕ ボタン残留を防ぐ。
 *
 * これがないと「resetWarning 中に できごとボタンで picker open → 背景に ✕ 残留」「clock モードに
 * 戻る → 本来出ないはずの ✕ が数秒残留」の不具合が起きる。各 caller に cancelWarning を呼ばせる
 * 設計だと忘れた経路で stale state が漏れるので、生存条件をモジュール 1 箇所で宣言してしまう。
 */
createRoot(() => {
  createEffect(on(clockMode, (m) => {
    if (m !== "freeRotate") cancelWarning();
  }, { defer: true }));
  createEffect(on(pickerOpen, (open) => {
    if (open) cancelWarning();
  }, { defer: true }));
});
