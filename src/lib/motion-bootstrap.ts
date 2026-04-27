/**
 * prefers-reduced-motion を listen して motion.ts の skip predicate と body.motion-reduce class を
 * 切り替える起動コード。src/index.tsx で `import "./lib/motion-bootstrap"` すれば ON、その 1 行を
 * 消せば全部 dormant (predicate デフォルトで素通し、body class も付かないので CSS rule も効かない)。
 *
 * ユーザー識別情報は読まない (matchMedia の `(prefers-reduced-motion: reduce)` は OS の
 * アクセシビリティ設定であり、フィンガープリンティング素材ではない)。
 */

import { setAnimationSkipPredicate } from "./motion";

const QUERY = "(prefers-reduced-motion: reduce)";
const mql = window.matchMedia(QUERY);

const updateBodyClass = () => {
  document.body.classList.toggle("motion-reduce", mql.matches);
};

setAnimationSkipPredicate(() => mql.matches);
updateBodyClass();
mql.addEventListener("change", updateBodyClass);
