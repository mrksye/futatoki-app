/**
 * View Transitions API のラッパー。
 * 対応ブラウザでは fn の実行を startViewTransition 経由にして、
 * 同じ view-transition-name を持つ要素同士の消滅→出現を自動でモーフィングさせる。
 * 非対応ブラウザでは単に fn を呼ぶだけ (機能としてはフォールバック)。
 *
 * Public API:
 *   - withViewTransition(fn)
 *
 * 副作用のないシンプルなヘルパー (state 無し)。
 */

export const withViewTransition = (fn: () => void) => {
  const doc = document as Document & {
    startViewTransition?: (cb: () => void) => unknown;
  };
  if (typeof doc.startViewTransition === "function") {
    doc.startViewTransition(fn);
  } else {
    fn();
  }
};
