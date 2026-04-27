/**
 * View Transitions API ラッパー。対応ブラウザでは fn を startViewTransition 経由で実行し、同じ
 * view-transition-name を持つ要素同士の消滅→出現を自動でモーフィングさせる。非対応ブラウザでは
 * fn を直接呼ぶフォールバックのみ。
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

/**
 * "morphing slot" 名。同じ slot 名を持つ要素が消滅→出現すると、対応ブラウザが合成的にモーフィング描画する。
 * 同時に両方が描画されることはなく、モード遷移時 (通常 ↔ 自由回転) にブラウザがモーフィング:
 *
 *   LEFT   通常モード:        AM/PM バッジ + 長押しプレビュー
 *          自由回転 manual:    予定ボタン (旧「てまわし/ぐりぐり」切替もここに居た)
 *
 *   RIGHT  通常モード:        パレット切替ボタン
 *          自由回転 manual:    1ふんもどす
 *
 * 新しい slot を追加する時はここに名前を加え、共有関係をコメントに残す。
 */
export const MORPHING_SLOT = {
  LEFT: "clock-left-slot",
  RIGHT: "clock-right-slot",
} as const;
