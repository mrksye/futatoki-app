import { createEffect, onCleanup } from "solid-js";
import { clockMode, transition } from "./state";
import { pickerOpen, closePicker } from "../activity/picker";
import { timerPhase, closePicker as closeTimerPicker } from "../timer/state";

/**
 * 「設定・操作モード」に入った後、IDLE_EXIT_MS ユーザー操作が無ければ transition("clock") で clock モードに
 * 戻す共通アイドル監視。リングメニュー (できごと / 時間設定) を開きっぱなしで放置しても戻す。退室は clockMode
 * 変化が回転 / たいむの transition を発火させるのでアニメーション付きで戻る。
 *
 * 対象モード (shouldRun):
 *   - freeRotate: できごとリングメニュー (activity picker) 開きっぱなしも含む。
 *   - timer の設定中のみ (timerPhase = unset / picking): 時間設定リングメニュー開きっぱなしも含む。
 *     running / paused / done はユーザーが立てた稼働中セッションなので対象外 (放置でカウントダウンを勝手に
 *     消さない)。
 *
 * 対象外: clock (既に静止) / autoRotate (放置で見せ続けるモードなので戻さない)。
 * 「操作」はクリック / タップダウン / ホイールのみ — マウス hover や単なる移動は無視する。
 * touchstart は古い iOS Safari 等で pointer events が安定しない端末向けの保険として併用。
 */

const IDLE_EXIT_MS = 180_000;

/** 操作と見做す DOM event 一覧。capture phase で document に listen する。 */
const ACTIVITY_EVENTS = ["pointerdown", "touchstart", "wheel"] as const;

const LISTENER_OPTIONS: AddEventListenerOptions = { capture: true, passive: true };
const REMOVE_OPTIONS: EventListenerOptions = { capture: true };

export const useIdleExitTimer = () => {
  let timerId: ReturnType<typeof setTimeout> | undefined;

  const clearTimer = () => {
    if (timerId !== undefined) {
      clearTimeout(timerId);
      timerId = undefined;
    }
  };

  /** アイドル監視を回すモードか。timer は設定中 (unset / picking) だけ (稼働中は走らせ続ける)。 */
  const shouldRun = () => {
    const mode = clockMode();
    if (mode === "freeRotate") return true;
    if (mode === "timer") {
      const phase = timerPhase();
      return phase === "unset" || phase === "picking";
    }
    return false;
  };

  const armTimer = () => {
    clearTimer();
    timerId = setTimeout(() => {
      // fire 時に再 check (180 秒の間に mode / timer phase が変わっている可能性があるので gate)。
      if (!shouldRun()) return;
      // 開いていればリングメニューを畳んでから戻す (退室アニメ前に overlay を消す)。各 close は自前ガードあり。
      if (clockMode() === "freeRotate") {
        if (pickerOpen()) closePicker();
      } else {
        closeTimerPicker(); // picking → unset。それ以外のフェーズでは no-op
      }
      transition("clock");
    }, IDLE_EXIT_MS);
  };

  const onActivity = () => {
    if (shouldRun()) armTimer();
  };

  /** 状態変化 (mode 切替 / activity picker 開閉 / timer フェーズ) を観測して自動 arm/clear。 */
  createEffect(() => {
    if (shouldRun()) {
      armTimer();
    } else {
      clearTimer();
    }
  });

  ACTIVITY_EVENTS.forEach((ev) =>
    document.addEventListener(ev, onActivity, LISTENER_OPTIONS),
  );

  onCleanup(() => {
    clearTimer();
    ACTIVITY_EVENTS.forEach((ev) =>
      document.removeEventListener(ev, onActivity, REMOVE_OPTIONS),
    );
  });
};
