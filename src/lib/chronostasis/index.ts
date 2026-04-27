/**
 * # chronostasis
 *
 * **chronostasis (クロノスタシス)** — 時計の秒針を見つめた直後、針が一瞬止まって見える視覚錯覚。
 * (神経科学/医学用語: https://en.wikipedia.org/wiki/Chronostasis)
 *
 * このモジュールは「動的な背景 (時計表示、CSS animation、setInterval / requestAnimationFrame
 * 系の tick 副作用) の上で重い合成エフェクトが走る間、下層を一斉に静止させる」状態を
 * 共有するための極小ライブラリ。
 *
 * ## なぜ必要か
 *
 * `backdrop-filter: blur` のような合成系エフェクトの本当の重さは「下のピクセルが変化するたびに
 * 再 blur する」コスト。下が完全に静止していればブラウザは blur 結果を compositing layer に
 * cache して 1 回 paint で済む = 古い iPad / 中華タブレット / 学習用タブレット等の非力な端末
 * でも実用負荷で動く。
 *
 * blur 系以外でも、長尺 opacity transition や transform spring 等「フレーム毎に下層を再合成する」
 * エフェクトの間は同じ問題が起きる。chronostasis 中はそれら下層 tick を一斉 suspend して
 * 合成資源を表側のエフェクトに渡す。
 *
 * ## 設計
 *
 * ゼロ依存・framework agnostic の vanilla TypeScript core。
 * 内部は **acquire 数のカウンタ** で管理し、複数ソース (例: ピッカー open + merge アニメ進行中)
 * が同時に chronostasis を要求しても、最後の release が外れるまで active を保持する。
 *
 * SolidJS 用の reactive accessor / body class hook は `./solid.ts` に分離。
 * 他のフレームワーク (React / Vue / vanilla) で使う場合も `subscribeChronostasis()` に
 * その環境の更新ハンドラを渡せば同等の bridge が書ける (新しい adapter を `./react.ts` 等として追加)。
 *
 * ## 公開 API
 *
 * - {@link inChronostasis} — 現在状態の同期 getter
 * - {@link requestChronostasis} — chronostasis を要求し release 関数を返す (lease 型)
 * - {@link subscribeChronostasis} — 状態変化を購読
 *
 * @packageDocumentation
 */

type ChronostasisListener = (active: boolean) => void;

let acquireCount = 0;
const listeners = new Set<ChronostasisListener>();

const notify = (active: boolean) => {
  listeners.forEach((listener) => listener(active));
};

/** 現在 chronostasis 状態にあるか (= 下層 tick 副作用を止めるべきか)。 */
export const inChronostasis = (): boolean => acquireCount > 0;

/**
 * chronostasis を 1 件 acquire し、release 関数を返す。複数の caller が同時に要求すると
 * 最後の release が呼ばれるまで active が継続する。
 *
 * 返された release 関数は idempotent (二重呼び出しても害なし)。SolidJS なら
 * `onCleanup(release)` に渡すだけで対称呼び出しが構造的に保証される (= leave 忘れバグの罠が無い)。
 *
 * @example
 * ```ts
 * const release = requestChronostasis();
 * try {
 *   // 重い合成エフェクト
 * } finally {
 *   release();
 * }
 * ```
 */
export const requestChronostasis = (): (() => void) => {
  acquireCount++;
  if (acquireCount === 1) notify(true);
  let released = false;
  return () => {
    if (released) return;
    released = true;
    acquireCount--;
    if (acquireCount === 0) notify(false);
  };
};

/**
 * 状態変化を購読する。listener は active が 0→1 / 1→0 の境界で呼ばれる
 * (acquire 数の途中増減では発火しない)。
 * 戻り値は購読解除関数。同じ listener を複数回 add しても Set の性質で 1 回だけ管理される。
 *
 * @example
 * ```ts
 * const stop = subscribeChronostasis((active) => {
 *   if (active) pauseTicker();
 *   else resumeTicker();
 * });
 * // 後始末:
 * stop();
 * ```
 */
export const subscribeChronostasis = (
  listener: ChronostasisListener,
): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
