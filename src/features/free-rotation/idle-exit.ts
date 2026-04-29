import { createEffect, onCleanup } from "solid-js";
import { clockMode, transition } from "./state";
import { pickerOpen } from "../schedule/picker";

/**
 * freeRotate モードに入った後、IDLE_EXIT_MS ユーザー操作が無ければ transition("clock") で clock モードに戻す。
 *
 * 戻さないケース: clockMode !== "freeRotate" (対象外) / pickerOpen=true (操作中扱い)。
 * 「操作」は pointermove / touchmove も含めて広めに watch するので drag や hover 中の誤検知は無い。
 */

const IDLE_EXIT_MS = 60_000;

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

  const shouldRun = () =>
    clockMode() === "freeRotate" && !pickerOpen();

  const armTimer = () => {
    clearTimer();
    timerId = setTimeout(() => {
      // fire 時に再 check (60 秒の間に状態が変わっている可能性があるので shouldRun と同じ条件で gate)。
      if (shouldRun()) transition("clock");
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
