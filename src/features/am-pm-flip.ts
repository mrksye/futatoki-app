import { createEffect, createMemo, createSignal, on, onCleanup, type Accessor } from "solid-js";
import { motionAllowed } from "../lib/motion";
import { isRotating, isTimerMode } from "./free-rotation/state";

/**
 * AM/PM バッジの操作。1 つのバッジに 3 つのジェスチャを束ねる:
 *
 *  - タップ (短押し): 押している間だけ反対側 (AM↔PM) を表示し、離すと戻る一瞬のプレビュー。
 *    押下=即時 flip、離す=RELEASE_DELAY_MS の余韻 → 380ms フェード (CSS .fade-on-dim) で通常表示へ。
 *  - 長押し (LONG_PRESS_MS): プレビュー中の flip をそのまま固定する。もう一度長押しで解除。
 *  - ダブルクリック: AM/PM 両盤を dim せず両方とも有効な色で表示する (showBoth)。再度で解除。
 *
 * 長押し固定 / ダブルクリック両方とも永続させず、60 秒経過 / 回転・たいむモード入り / リロードで自動解除する
 * (リロードは in-memory signal なので自然にリセット)。長押し固定と showBoth は排他で、一方を入れると他方は解除。
 *
 * 内部状態 (flipped / locked / showBoth) は外に出さず、表示用の isAm と showBoth だけ公開する。
 */

/** 離した後に flip を保持する余韻 (ms)。離した瞬間にすぐ戻り始めずワンテンポ置く演出用。 */
const RELEASE_DELAY_MS = 160;
/** 長押し固定の閾値。EventIcon / 時計面 / 回転の LONG_PRESS_MS と意図的に揃える (1 つの ms 感覚を全 long-press UI で共有)。 */
const LONG_PRESS_MS = 500;
/** ダブルクリック判定の上限間隔。pointerdown 同士の間隔のみで判定する (1 回目の up を待たない)。 */
const DOUBLE_CLICK_MS = 320;
/** 固定 / showBoth を放置したまま戻し忘れるのを防ぐ自動解除時間。 */
const AUTO_RELEASE_MS = 60 * 1000;

export const useAmPmFlip = (actualIsAm: Accessor<boolean>) => {
  /** 表示が反対側を向いているか (短押しプレビュー or 長押し固定の両方で立つ)。 */
  const [flipped, setFlipped] = createSignal(false);
  /** flip が固定 (押下なしで保持) されているか。 */
  const [locked, setLocked] = createSignal(false);
  /** AM/PM 両盤を dim せず両方有効な色で見せているか。 */
  const [showBoth, setShowBoth] = createSignal(false);

  let releaseTimer: ReturnType<typeof setTimeout> | null = null;
  let longPressTimer: ReturnType<typeof setTimeout> | null = null;
  let lockAutoReleaseTimer: ReturnType<typeof setTimeout> | null = null;
  let showBothAutoReleaseTimer: ReturnType<typeof setTimeout> | null = null;
  let lastDownAt = 0;

  const clear = (timer: ReturnType<typeof setTimeout> | null) => {
    if (timer !== null) clearTimeout(timer);
    return null;
  };

  /** flip を完全に通常表示へ戻す (固定もプレビューも解除)。 */
  const resetFlip = () => {
    releaseTimer = clear(releaseTimer);
    longPressTimer = clear(longPressTimer);
    lockAutoReleaseTimer = clear(lockAutoReleaseTimer);
    setLocked(false);
    setFlipped(false);
  };

  const clearShowBoth = () => {
    showBothAutoReleaseTimer = clear(showBothAutoReleaseTimer);
    setShowBoth(false);
  };

  /** 長押し成立: プレビュー中の flip を固定 / 解除でトグル。固定 ON のときだけ 60 秒の自動解除を仕込み、
   *  排他の showBoth は落とす。 */
  const toggleLock = () => {
    const next = !locked();
    setLocked(next);
    lockAutoReleaseTimer = clear(lockAutoReleaseTimer);
    if (next) {
      clearShowBoth();
      lockAutoReleaseTimer = setTimeout(() => {
        lockAutoReleaseTimer = null;
        resetFlip();
      }, AUTO_RELEASE_MS);
    } else {
      // 解除側の長押しは閾値が済んだ瞬間に通常表示へ戻す (pointer を離すまで待たない)。
      setFlipped(false);
    }
  };

  /** ダブルクリック成立: 両盤有効表示をトグル。ON のときだけ 60 秒の自動解除を仕込み、排他の flip 固定は落とす。 */
  const toggleShowBoth = () => {
    const next = !showBoth();
    setShowBoth(next);
    showBothAutoReleaseTimer = clear(showBothAutoReleaseTimer);
    if (next) {
      resetFlip();
      showBothAutoReleaseTimer = setTimeout(() => {
        showBothAutoReleaseTimer = null;
        setShowBoth(false);
      }, AUTO_RELEASE_MS);
    }
  };

  const startPress = () => {
    const now = performance.now();
    const isDouble = now - lastDownAt <= DOUBLE_CLICK_MS;
    lastDownAt = now;

    if (isDouble) {
      // 2 回目の down で確定。直前 down 由来のプレビュー / 長押し待ちは破棄してから両盤表示へ。
      releaseTimer = clear(releaseTimer);
      longPressTimer = clear(longPressTimer);
      setFlipped(false);
      toggleShowBoth();
      return;
    }

    // 1 回目 (短押し / 長押しの起点): 押下した瞬間から flip。
    releaseTimer = clear(releaseTimer);
    setFlipped(true);
    longPressTimer = clear(longPressTimer);
    longPressTimer = setTimeout(() => {
      longPressTimer = null;
      toggleLock();
    }, LONG_PRESS_MS);
  };

  const endPress = () => {
    longPressTimer = clear(longPressTimer);
    // 固定中は離しても保持。固定でない (短押し / 長押しで解除した直後) なら余韻を置いて通常表示へ戻す。
    if (locked()) return;
    if (!motionAllowed()) {
      setFlipped(false);
      return;
    }
    releaseTimer = clear(releaseTimer);
    releaseTimer = setTimeout(() => {
      releaseTimer = null;
      setFlipped(false);
    }, RELEASE_DELAY_MS);
  };

  /** 回転 / たいむモードに入ったら固定・両盤表示を全解除。どちらも AM/PM バッジ自体が消えるので、
   *  状態だけ残るととけい復帰時に混乱するのを防ぐ。 */
  createEffect(on([isRotating, isTimerMode], ([rotating, timer]) => {
    if (!rotating && !timer) return;
    resetFlip();
    clearShowBoth();
  }, { defer: true }));

  onCleanup(() => {
    releaseTimer = clear(releaseTimer);
    longPressTimer = clear(longPressTimer);
    lockAutoReleaseTimer = clear(lockAutoReleaseTimer);
    showBothAutoReleaseTimer = clear(showBothAutoReleaseTimer);
  });

  const isAm = createMemo(() => flipped() ? !actualIsAm() : actualIsAm());

  return { isAm, showBoth, flipLocked: locked, startPress, endPress };
};
