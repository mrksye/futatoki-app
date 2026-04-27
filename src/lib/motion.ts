/**
 * 装飾アニメーションを 1 ヶ所で制御する薄い facade。デフォルトは完全に透過 (el.animate そのまま) で、
 * src/lib/motion-bootstrap.ts が import された時だけ predicate が設定され prefers-reduced-motion で
 * アニメをスキップする。
 *
 * 機能を消す時は src/index.tsx の `import "./lib/motion-bootstrap"` を消すだけ
 * (motionAllowed() は常に true、animateMotion は素通し、body class も付かないので CSS 側 body.motion-reduce も dormant)。
 */

let skipPredicate: () => boolean = () => false;

export const setAnimationSkipPredicate = (fn: () => boolean): void => {
  skipPredicate = fn;
};

/** モーション (装飾アニメ) が許可されているか。skip predicate の反転。 */
export const motionAllowed = (): boolean => !skipPredicate();

/** Element.animate の薄いラッパー。skip 対象なら何もせず null を返すので caller は ?. で連鎖できる。 */
export const animateMotion = (
  el: Element,
  keyframes: Keyframe[],
  options: KeyframeAnimationOptions,
): Animation | null => {
  if (skipPredicate()) return null;
  return el.animate(keyframes, options);
};
