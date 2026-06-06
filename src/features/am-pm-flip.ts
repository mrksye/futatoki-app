import { createEffect, createMemo, createSignal, on, onCleanup, type Accessor } from "solid-js";
import { isRotating, isTimerMode } from "./free-rotation/state";

/**
 * AM/PM バッジの長押しトグル: バッジを 500ms 長押しするたびに AM↔PM の表示が反対側へ flip し、その状態を
 * 保持する。もう一度長押しすると元 (実時刻ベースの actualIsAm) に戻る。実時刻と逆の盤を意図的に見たいとき用。
 *
 * flip は永続させず、60 秒経過 / 回転 (free・auto) 入り / たいむモード入り / リロード のいずれかで自動解除する。
 * リロードは flipped が in-memory signal なので自然にリセットされる。
 * "今 flip しているか" の真偽 (flipped) は外に出さず、表示用の isAm だけ公開する。
 */

/** 長押し成立の閾値。EventIcon / 時計面 / 回転の LONG_PRESS_MS と意図的に揃える (1 つの ms 感覚を全 long-press UI で共有)。 */
const LONG_PRESS_MS = 500;
/** flip を放置したまま戻し忘れるのを防ぐ自動解除時間。 */
const AUTO_RELEASE_MS = 60 * 1000;

export const useAmPmFlip = (actualIsAm: Accessor<boolean>) => {
  const [flipped, setFlipped] = createSignal(false);
  let pressTimer: ReturnType<typeof setTimeout> | null = null;
  let autoReleaseTimer: ReturnType<typeof setTimeout> | null = null;

  const cancelPressTimer = () => {
    if (pressTimer !== null) {
      clearTimeout(pressTimer);
      pressTimer = null;
    }
  };
  const cancelAutoRelease = () => {
    if (autoReleaseTimer !== null) {
      clearTimeout(autoReleaseTimer);
      autoReleaseTimer = null;
    }
  };

  const release = () => {
    cancelAutoRelease();
    setFlipped(false);
  };

  /** 長押し成立時に flip を反転。on にしたときだけ 60 秒の自動解除を測り直し、戻したときは破棄する。 */
  const toggle = () => {
    const next = !flipped();
    setFlipped(next);
    cancelAutoRelease();
    if (next) {
      autoReleaseTimer = setTimeout(() => {
        autoReleaseTimer = null;
        setFlipped(false);
      }, AUTO_RELEASE_MS);
    }
  };

  const startPress = () => {
    cancelPressTimer();
    pressTimer = setTimeout(() => {
      pressTimer = null;
      toggle();
    }, LONG_PRESS_MS);
  };
  /** 閾値前に離した / バッジ外へ出た / cancel → 長押し不成立なので何もせずタイマーだけ破棄。 */
  const cancelPress = () => {
    cancelPressTimer();
  };

  /** 回転 / たいむモードに入ったら flip を解除。どちらも AM/PM バッジ自体が消えるので、flip だけ残ると
   *  とけい復帰時に裏側表示のまま戻って混乱するのを防ぐ。 */
  createEffect(on([isRotating, isTimerMode], ([rotating, timer]) => {
    if (!rotating && !timer) return;
    if (!flipped()) return;
    release();
  }, { defer: true }));

  onCleanup(() => {
    cancelPressTimer();
    cancelAutoRelease();
  });

  const isAm = createMemo(() => flipped() ? !actualIsAm() : actualIsAm());

  return { isAm, startPress, cancelPress };
};
