/**
 * # chronostasis — SolidJS 統合
 *
 * `./index.ts` (framework agnostic core) に SolidJS の reactive primitive を被せる薄い adapter。
 *
 * - {@link useChronostasis} — chronostasis 状態を Solid の {@link Accessor} として取得
 * - {@link useChronostasisBodyClass} — `document.body` の class を toggle する副作用
 *
 * いずれも `onCleanup` を持つので reactive owner (= component setup) の中で呼ぶこと。
 *
 * 他フレームワークで使う場合はこの adapter を真似て、core の {@link subscribeChronostasis} に
 * その環境の更新ハンドラ (React の `useSyncExternalStore`、Vue の `ref` 等) を繋ぐだけで良い。
 *
 * @packageDocumentation
 */

import { createEffect, createSignal, onCleanup, type Accessor } from "solid-js";
import { inChronostasis, subscribeChronostasis } from "./index";

/** デフォルトで toggle する body class 名。 */
const DEFAULT_BODY_CLASS = "chronostasis";

/**
 * chronostasis 状態を Solid の reactive accessor として取得する。
 *
 * 内部で {@link subscribeChronostasis} に登録するだけの軽量実装。
 * 複数コンポーネントから呼んでも問題ないが、過剰呼び出しが気になるなら呼び出し側で memo するのが筋。
 *
 * @example
 * ```ts
 * const inFreeze = useChronostasis();
 * createEffect(on(inFreeze, (frozen) => {
 *   if (frozen) return;       // 凍結中は副作用を起動しない
 *   const id = setInterval(...);
 *   onCleanup(() => clearInterval(id));
 * }));
 * ```
 */
export const useChronostasis = (): Accessor<boolean> => {
  const [active, setActive] = createSignal(inChronostasis());
  onCleanup(subscribeChronostasis(setActive));
  return active;
};

/**
 * `document.body` に class を toggle する副作用を起動する。
 *
 * CSS animation を CSS セレクタ側で一括停止する用途で使う。
 * 例: `body.chronostasis .star { animation-play-state: paused; }`
 *
 * @param className 付与する class 名。デフォルト `"chronostasis"`。
 */
export const useChronostasisBodyClass = (className: string = DEFAULT_BODY_CLASS): void => {
  const active = useChronostasis();
  createEffect(() => {
    document.body.classList.toggle(className, active());
  });
};
