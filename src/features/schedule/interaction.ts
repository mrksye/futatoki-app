import { createSignal } from "solid-js";
import { deleteScheduleAt } from "./state";
import { motionAllowed } from "../../lib/motion";

/**
 * 予定アイコンの削除 UX 状態。
 *
 *   none ──長押し 500ms──> warning ──✕ボタンタップ──> deleting ──アニメ完了──> none
 *                              ├──外タップ──> none
 *                              └──3 秒タイムアウト──> none
 *
 * グローバル単一状態 (同時に warning にできるイベントは 1 つだけ)。生 setter は未 export。
 */

type Interaction =
  | { type: "none" }
  | { type: "warning"; minutes: number }
  | { type: "deleting"; minutes: number };

const WARNING_AUTO_CANCEL_MS = 3000;
/** くるくる削除アニメの全体 duration と揃える (ScheduleLayer の POOF_DURATION_MS)。 */
const DELETE_ANIMATION_MS = 900;

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

/** 外タップやキャンセル時に呼ぶ。warning 中なら none に戻す。 */
export const cancelWarning = () => {
  if (warningTimer) clearTimeout(warningTimer);
  warningTimer = undefined;
  if (interaction().type === "warning") {
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
    deleteScheduleAt(minutes);
    setInteractionRaw({ type: "none" });
  }, delay);
};
