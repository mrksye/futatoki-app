/**
 * # chronostasis
 *
 * **chronostasis (クロノスタシス)** — the visual illusion where the second hand of a clock
 * appears to freeze for a moment when you first glance at it.
 * (See: https://en.wikipedia.org/wiki/Chronostasis)
 *
 * This module provides a tiny shared-state library that lets you suspend the dynamic background
 * of a page (clock display, CSS animations, setInterval / requestAnimationFrame side effects)
 * for the duration of a heavy compositing effect running on top of it.
 *
 * ## Why this is needed
 *
 * Compositing effects like `backdrop-filter: blur` are expensive precisely because the browser
 * has to re-blur every time the underlying pixels change. If the layer underneath is completely
 * still, the browser can cache the blurred result on its compositing layer and paint it once —
 * which makes the effect viable on low-end hardware (older iPads, low-cost tablets, education
 * tablets, etc.).
 *
 * The same problem appears beyond blur. Long opacity transitions, transform springs, and other
 * "recomposite the layer underneath every frame" effects all suffer when background work keeps
 * mutating that layer. While chronostasis is held, those background ticks are suspended so
 * compositing resources can go to the foreground effect.
 *
 * ## Design
 *
 * Zero dependencies, framework-agnostic vanilla TypeScript core.
 * Internally tracked as an **acquire counter** so multiple sources (e.g. a picker that opened +
 * a merge animation in flight) can request chronostasis simultaneously; chronostasis stays
 * held until the last release is called.
 *
 * The SolidJS reactive accessor and body-class hook live in `./solid.ts`. To bridge to other
 * frameworks (React, Vue, vanilla DOM), pass an environment-specific update handler to
 * `subscribeChronostasis()` — see `./solid.ts` as a reference adapter (add new ones at
 * `./react.ts`, etc.).
 *
 * ## Public API
 *
 * - {@link inChronostasis} — synchronous getter for the current state
 * - {@link requestChronostasis} — request chronostasis and receive a release function (lease style)
 * - {@link subscribeChronostasis} — subscribe to state transitions
 *
 * @packageDocumentation
 */

type ChronostasisListener = (held: boolean) => void;

let acquireCount = 0;
const listeners = new Set<ChronostasisListener>();

const notify = (held: boolean) => {
  listeners.forEach((listener) => listener(held));
};

/** Whether chronostasis is currently held (= background ticks should pause). */
export const inChronostasis = (): boolean => acquireCount > 0;

/**
 * Acquire one chronostasis lease and return its release function. When multiple callers hold
 * leases simultaneously, chronostasis stays held until the last release is called.
 *
 * The returned release function is idempotent (calling it more than once is harmless). In
 * SolidJS, passing it to `onCleanup(release)` ensures the symmetric release is structurally
 * guaranteed — there is no "forgot to leave" trap.
 *
 * @example
 * ```ts
 * const release = requestChronostasis();
 * try {
 *   // heavy compositing effect
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
 * Subscribe to chronostasis state changes. The listener is invoked only at the boundaries
 * (0 → 1 and 1 → 0); intermediate changes to the acquire count do not fire it.
 * Returns an unsubscribe function. Adding the same listener multiple times has no effect
 * (the underlying Set deduplicates).
 *
 * @example
 * ```ts
 * const unsubscribe = subscribeChronostasis((held) => {
 *   if (held) pauseTicker();
 *   else resumeTicker();
 * });
 * // Cleanup:
 * unsubscribe();
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
