import { createEffect, createSignal, on, onCleanup, type Accessor } from "solid-js";
import { rotateActive, mergedVisible } from "./state";
import { requestChronostasis } from "../../lib/chronostasis";

/**
 * かさね (merged) / わける (split) 切替時のトランジション支援。
 *
 * Public API:
 *   - hook:        useMergeAnimation ({ mergedVisible, transitioning, mergedRevealed } を返す)
 *   - hook:        useButtonsDimmedDuringMergeFlip (SettingsPanel 専用)
 *   - 計算ヘルパー: amTransform, pmTransform, mergedTransform, splitShadow
 *
 * mergedVisible 自体は state.ts が公開する accessor (rotateActive との AND ガード済み)。
 * このモジュールはそれを観測して transitioning フラグを 620ms 立ち下げる + 「fresh mount された
 * merged container を CSS transition できちんとふわっと現すための reveal 信号」を作る。
 *
 * mergedRevealed は mergedVisible に追従するが、false → true の rising edge だけ double
 * requestAnimationFrame 分遅延して true になる。ClockLayout 側で opacity / mergedTransform は
 * こちらを参照する。
 *
 * なぜ double rAF が要るか:
 *   merged container は <Show when={mergedVisible() || transitioning()}> で mount / unmount
 *   される。「わけ」状態で 620ms 以上経つと transitioning が false に戻って container が DOM
 *   から完全に消える。そこから「かさねる」を押すと container が fresh mount され、いきなり
 *   opacity=1 / scale=1 (最終状態) で生まれる。CSS transition は「前の computed style から
 *   新しい style への差分」で発火するため、前の style を持たない fresh mount 要素では
 *   transition が走らない (= ふわっとならず瞬時に出る)。
 *
 *   そこで一旦 opacity=0 / scale=0.55 で mount → 1 frame paint させて initial state を
 *   browser に認識させる → 次フレームで reveal に切り替え → CSS が値変化を拾って transition
 *   起動、という流れにする。double rAF は「mount したフレームを必ず 1 回 paint させてから
 *   切替える」ための保険 (single rAF だと paint 前に値変更を踏んでしまう browser 実装がある)。
 */

const TRANSITION_DURATION_MS = 620;

export const useMergeAnimation = () => {
  const [transitioning, setTransitioning] = createSignal(false);
  // mergedVisible 初期値で同期。以降は createEffect 内で更新する。
  const [mergedRevealed, setMergedRevealed] = createSignal(mergedVisible());
  let timer: ReturnType<typeof setTimeout> | undefined;
  let revealRaf1: number | null = null;
  let revealRaf2: number | null = null;

  const cancelReveal = () => {
    if (revealRaf1 !== null) {
      cancelAnimationFrame(revealRaf1);
      revealRaf1 = null;
    }
    if (revealRaf2 !== null) {
      cancelAnimationFrame(revealRaf2);
      revealRaf2 = null;
    }
  };

  createEffect(
    on(
      mergedVisible,
      (curr, prev) => {
        if (prev === undefined) return;
        setTransitioning(true);
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => setTransitioning(false), TRANSITION_DURATION_MS);

        cancelReveal();
        if (curr) {
          // rising edge: 1 frame paint させてから reveal して CSS transition を起こす。
          revealRaf1 = requestAnimationFrame(() => {
            revealRaf1 = null;
            revealRaf2 = requestAnimationFrame(() => {
              revealRaf2 = null;
              setMergedRevealed(true);
            });
          });
        } else {
          // falling edge: 即座に reveal=false。CSS が前のフレーム (opacity=1) から
          // 新しい opacity=0 への差分を拾って transition 起動。
          setMergedRevealed(false);
        }
      },
    ),
  );

  // transition 中は chronostasis を要求して下層 tick を凍結 → wrapper opacity 380ms フェードと
  // merged container の transform/opacity 同時アニメに合成資源を全振りさせる。
  // useCurrentTime の setInterval / auto-rotate の rAF / Star twinkle の CSS animation が一斉停止。
  createEffect(
    on(transitioning, (active) => {
      if (!active) return;
      const release = requestChronostasis();
      onCleanup(release);
    }),
  );

  onCleanup(() => {
    if (timer) clearTimeout(timer);
    cancelReveal();
  });

  return { mergedVisible, transitioning, mergedRevealed };
};

// ===== transform / filter 計算ヘルパー (純関数) =====

export const amTransform = (mergedVisible: boolean, isLandscape: boolean): string => {
  if (!mergedVisible) return "translate(0, 0) scale(1)";
  return isLandscape
    ? "translateX(50%) scale(0.96)"
    : "translateY(50%) scale(0.96)";
};

export const pmTransform = (mergedVisible: boolean, isLandscape: boolean): string => {
  if (!mergedVisible) return "translate(0, 0) scale(1)";
  return isLandscape
    ? "translateX(-50%) scale(0.96)"
    : "translateY(-50%) scale(0.96)";
};

export const mergedTransform = (mergedVisible: boolean): string =>
  mergedVisible ? "scale(1)" : "scale(0.55)";

export const splitShadow = (transitioning: boolean): string =>
  transitioning ? "drop-shadow(0 6px 26px rgba(40,28,90,0.35))" : "none";

/**
 * かさね/わけ切替時に他のボタンを薄く退避させたいケース用の hook。
 * mergedVisible の遷移を観測。ただし rotateActive 自体の出入りで mergedVisible が
 * 動いた時 (= モード遷移そのもの) は無視し、純粋に「manual 中の merged トグル」だけで dim 起動。
 *
 * SettingsPanel 専用ヘルパー。
 */
export const useButtonsDimmedDuringMergeFlip = (): Accessor<boolean> => {
  const [dimmed, setDimmed] = createSignal(false);
  let timer: ReturnType<typeof setTimeout> | undefined;
  let prevActive = rotateActive();

  createEffect(
    on(
      mergedVisible,
      (_curr, prev) => {
        const currActive = rotateActive();
        const activeChanged = currActive !== prevActive;
        prevActive = currActive;
        if (prev === undefined) return;
        if (activeChanged) return;
        setDimmed(true);
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => setDimmed(false), TRANSITION_DURATION_MS);
      },
    ),
  );

  onCleanup(() => {
    if (timer) clearTimeout(timer);
  });

  return dimmed;
};
