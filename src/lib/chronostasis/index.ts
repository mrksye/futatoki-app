/**
 * # chronostasis
 *
 * **chronostasis (クロノスタシス)** — 時計の秒針を見つめた直後、針が一瞬止まって見える視覚錯覚。
 * (神経科学/医学用語: https://en.wikipedia.org/wiki/Chronostasis)
 *
 * このモジュールは「動的な背景 (時計表示、CSS animation、setInterval / requestAnimationFrame
 * 系の tick 副作用) の上にオーバーレイを出している間、下層を一斉に静止させる」状態を
 * 共有するための極小ライブラリ。
 *
 * ## なぜ必要か
 *
 * `backdrop-filter: blur` のような合成系エフェクトの本当の重さは「下のピクセルが変化するたびに
 * 再 blur する」コスト。下が完全に静止していればブラウザは blur 結果を compositing layer に
 * cache して 1 回 paint で済む = 古い iPad / 中華タブレット / 学習用タブレット等の非力な端末
 * でも実用負荷で動く。そのために、オーバーレイを開いている間だけ tick 系の副作用を一斉に
 * suspend する仕組みが要る。
 *
 * ## 設計
 *
 * ゼロ依存・framework agnostic の vanilla TypeScript core。
 * グローバル boolean state (`active`) と listener Set だけのシンプルな pub/sub。
 *
 * SolidJS 用の reactive accessor / body class hook は `./solid.ts` に分離。
 * 他のフレームワーク (React / Vue / vanilla) で使う場合も `subscribeChronostasis()` に
 * その環境の更新ハンドラを渡せば同等の bridge が書ける (新しい adapter を `./react.ts` 等として追加)。
 *
 * ## 公開 API
 *
 * - {@link inChronostasis} — 現在状態の同期 getter
 * - {@link enterChronostasis} / {@link leaveChronostasis} — semantic な切替
 * - {@link setChronostasis} — 直接代入 (冪等)
 * - {@link subscribeChronostasis} — 状態変化を購読
 *
 * @packageDocumentation
 */

type ChronostasisListener = (active: boolean) => void;

let active = false;
const listeners = new Set<ChronostasisListener>();

/** 現在 chronostasis 状態にあるか (= 下層 tick 副作用を止めるべきか)。 */
export const inChronostasis = (): boolean => active;

/**
 * 状態を直接書き換える。現在値と同じなら何もしない (冪等、listener 発火なし)。
 * 多くの呼び出し側は意味の明示的な {@link enterChronostasis} / {@link leaveChronostasis} を使えば良い。
 */
export const setChronostasis = (next: boolean): void => {
  if (active === next) return;
  active = next;
  listeners.forEach((listener) => listener(next));
};

/** chronostasis に入る (= 下層を静止させる)。 */
export const enterChronostasis = (): void => setChronostasis(true);

/** chronostasis から出る (= 下層を再開させる)。 */
export const leaveChronostasis = (): void => setChronostasis(false);

/**
 * 状態変化を購読する。listener は active が変わるたびに新しい値で呼ばれる。
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
