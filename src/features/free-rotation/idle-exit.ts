import { createEffect, onCleanup } from "solid-js";
import { clockMode, transition } from "./state";
import { pickerOpen, closePicker } from "../schedule/picker";

/**
 * freeRotate モードに入った後、IDLE_EXIT_MS ユーザー操作が無ければ transition("clock") で clock モードに戻す。
 * picker (リングメニュー) 開いてる間も同じ timer が走り続け、idle 経過で picker を閉じてから clock へ遷移する
 * (picker 開きっぱなしで放置 → 永久に rotation モード居残り、を防ぐ)。
 *
 * 戻さないケース: clockMode !== "freeRotate" (対象外)。
 * 「操作」は pointermove / touchmove も含めて広めに watch するので drag や hover 中の誤検知は無い。
 */

const IDLE_EXIT_MS = 180_000;

/** 操作と見做す DOM event 一覧。capture phase で document に listen する。 */
const ACTIVITY_EVENTS = [
  "pointerdown",
  "pointermove",
  "wheel",
  "touchstart",
  "touchmove",
  "keydown",
] as const;

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

  const shouldRun = () => clockMode() === "freeRotate";

  const armTimer = () => {
    clearTimer();
    timerId = setTimeout(() => {
      // fire 時に再 check (180 秒の間に mode が変わっている可能性があるので gate)。
      if (clockMode() !== "freeRotate") return;
      if (pickerOpen()) closePicker();
      transition("clock");
    }, IDLE_EXIT_MS);
  };

  const onActivity = () => {
    if (shouldRun()) armTimer();
  };

  /** 状態変化 (mode 切替 / picker 開閉) を観測して自動 arm/clear。 */
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
