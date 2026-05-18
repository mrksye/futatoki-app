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

/** ポヨン3 (3 段の高速バウンス)。タップ反応 / マッチ window 入り口の one-shot で共通使用。
 *  scale 中心は呼び出し側で transform-origin: center を確保しておくこと。 */
export const POYON3_DURATION_MS = 400;
export const POYON3_KEYFRAMES: Keyframe[] = [
  { transform: "scale(1)",    offset: 0 },
  { transform: "scale(1.22)", offset: 0.13 },
  { transform: "scale(0.90)", offset: 0.26 },
  { transform: "scale(1.16)", offset: 0.43 },
  { transform: "scale(0.94)", offset: 0.56 },
  { transform: "scale(1.10)", offset: 0.74 },
  { transform: "scale(1)",    offset: 1 },
];

export const playPoyon3 = (el: Element): Animation | null =>
  animateMotion(el, POYON3_KEYFRAMES, { duration: POYON3_DURATION_MS, easing: "ease-out" });

/** キラン (一筋の白帯が斜めに過ぎ去る sheen)。ガラスを傾けた瞬間、あるいはクレジットカードの
 *  ホログラムが光を返すような ack。時計面のような大面積で全体 brightness pulse を打つと「点滅」に
 *  感じてちらつくため、面の上を局所的に通過する反射に置き換えてある。
 *  host 内に一時 overlay child を append → WAAPI で帯を X 方向に走らせ、finish で overlay ごと remove。
 *  常駐 translucent layer を残さない (合成負荷は単発のみ)。連打時は前回 overlay を先に外して同時重畳を防ぐ。
 *  円形クロック面に対しては host 短辺基準の clip-path: circle(50%) で帯を円内に閉じ込めるため、host は
 *  bbox 中央に円が描かれる構造 (square host / SVG preserveAspectRatio meet による短辺 fit) を前提とする。 */
export const TAP_SHEEN_DURATION_MS = 420;
const TAP_SHEEN_MARKER = "data-tap-sheen";

export const playTapSheen = (host: HTMLElement): Animation | null => {
  if (skipPredicate()) return null;
  host.querySelector(`[${TAP_SHEEN_MARKER}]`)?.remove();
  const overlay = document.createElement("div");
  overlay.setAttribute(TAP_SHEEN_MARKER, "");
  overlay.style.cssText = [
    "position:absolute",
    "inset:0",
    "pointer-events:none",
    "overflow:hidden",
    "clip-path:circle(50%)",
  ].join(";");
  const band = document.createElement("div");
  band.style.cssText = [
    "position:absolute",
    "top:-25%",
    "left:0",
    "width:22%",
    "height:150%",
    "background:linear-gradient(90deg,transparent 0%,rgba(255,255,255,0.55) 50%,transparent 100%)",
    "filter:blur(6px)",
    "transform-origin:center",
  ].join(";");
  overlay.appendChild(band);
  host.appendChild(overlay);
  const animation = band.animate(
    [
      { transform: "translateX(-200%) rotate(20deg)" },
      { transform: "translateX(550%) rotate(20deg)" },
    ],
    { duration: TAP_SHEEN_DURATION_MS, easing: "cubic-bezier(0.2,0.6,0.2,1)" },
  );
  const cleanup = () => overlay.remove();
  animation.onfinish = cleanup;
  animation.oncancel = cleanup;
  return animation;
};

/** イヤイヤ (左右ダブルシェイク + 一拍休 + 2 周目早め)。長押し時の「アカン」拒否表現。
 *  amplitudePx は呼び出し側の要素サイズに応じて指定する: 小要素 (event icon ~30px) は default 8px で
 *  「ブンブン首を振る」感、大面積 (時計面 ~600px) は 5px 前後で「小さく速く首を振る」感に下げる。
 *  同じ 8px を時計に使うと振りの絶対量は同じでも、巨大オブジェクト全体がガクッと寄るので
 *  「イヤイヤ」じゃなく「ぐらつき」になってしまう。
 *  将来的には rotateY との組み合わせで顔を振る奥行きを足したい (現状は translateX のみで暫定)。 */
export const SHAKE_NO_DURATION_MS = 600;
const buildShakeNoKeyframes = (amplitudePx: number): Keyframe[] => [
  { transform: "translateX(0)",                  offset: 0 },
  { transform: `translateX(-${amplitudePx}px)`,  offset: 0.20 },  // 1 周目 左
  { transform: `translateX(${amplitudePx}px)`,   offset: 0.45 },  // 1 周目 右
  { transform: "translateX(0)",                  offset: 0.55 },  // 一拍休
  { transform: `translateX(-${amplitudePx}px)`,  offset: 0.65 },  // 2 周目 左 (テンポ早い)
  { transform: `translateX(${amplitudePx}px)`,   offset: 0.80 },  // 2 周目 右
  { transform: "translateX(0)",                  offset: 1 },
];

export const playShakeNo = (el: Element, amplitudePx = 8): Animation | null =>
  animateMotion(el, buildShakeNoKeyframes(amplitudePx), {
    duration: SHAKE_NO_DURATION_MS,
    easing: "ease-in-out",
  });
