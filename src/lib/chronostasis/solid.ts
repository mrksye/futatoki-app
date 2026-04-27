/**
 * # chronostasis — SolidJS integration
 *
 * A thin adapter that wraps the framework-agnostic core in `./index.ts` with SolidJS reactive
 * primitives.
 *
 * - {@link useChronostasis} — read chronostasis state as a Solid {@link Accessor}
 * - {@link useChronostasisBodyClass} — side effect that toggles a class on `document.body`
 *
 * Both register an `onCleanup`, so they must be called inside a reactive owner (= component setup).
 *
 * To support another framework, mirror this adapter and bridge the core's
 * {@link subscribeChronostasis} to that framework's update primitive (React's `useSyncExternalStore`,
 * Vue's `ref`, etc.).
 *
 * @packageDocumentation
 */

import { createEffect, createSignal, onCleanup, type Accessor } from "solid-js";
import { inChronostasis, subscribeChronostasis } from "./index";

/** Default body class name to toggle. */
const DEFAULT_BODY_CLASS = "chronostasis";

/**
 * Read chronostasis state as a Solid reactive accessor.
 *
 * Lightweight implementation — internally just registers via {@link subscribeChronostasis}.
 * Calling it from multiple components is fine; if call frequency becomes a concern, memoize
 * at the call site.
 *
 * @example
 * ```ts
 * const inChronostasis = useChronostasis();
 * createEffect(on(inChronostasis, (held) => {
 *   if (held) return;       // do not start the side effect while chronostasis is held
 *   const id = setInterval(...);
 *   onCleanup(() => clearInterval(id));
 * }));
 * ```
 */
export const useChronostasis = (): Accessor<boolean> => {
  const [held, setHeld] = createSignal(inChronostasis());
  onCleanup(subscribeChronostasis(setHeld));
  return held;
};

/**
 * Toggle a class on `document.body` whenever chronostasis state changes.
 *
 * Use it to pause CSS animations in bulk via a CSS selector.
 * Example: `body.chronostasis .star { animation-play-state: paused; }`
 *
 * @param className Class name to apply. Defaults to `"chronostasis"`.
 */
export const useChronostasisBodyClass = (className: string = DEFAULT_BODY_CLASS): void => {
  const held = useChronostasis();
  createEffect(() => {
    document.body.classList.toggle(className, held());
  });
};
