import { motionAllowed } from "../../lib/motion";

/**
 * 解錠した瞬間に DOM へ直接ねじ込む金色オーラ。Solid のツリーには一切載らず、document.body へ生の
 * <div> を append するだけ — component として host に差し込まないので、本体コードに JSX 行が 1 行も
 * 増えない (視覚の差し込み口は knockingOnPilotModesDoor の中だけ)。やや黒魔術。冪等で、reload すれば
 * DOM ごと消える (= 解錠も視覚も session 限り)。
 */

let summoned = false;

/** 縁から内へ滲む inset glow 3 層 (鋭い境界線は作らず = 枠ではなくオーラ)。 */
const AURA_SHADOW =
  "inset 0 0 14px rgba(255,200,61,0.7)," +
  "inset 0 0 46px rgba(255,200,61,0.5)," +
  "inset 0 0 120px rgba(255,200,61,0.26)";

export const summonGoldenAura = (): void => {
  if (summoned || typeof document === "undefined") return;
  summoned = true;

  const el = document.createElement("div");
  el.setAttribute("aria-hidden", "true");
  el.style.cssText =
    "position:fixed;top:0;right:0;bottom:0;left:0;" +
    `pointer-events:none;z-index:200;box-shadow:${AURA_SHADOW}`;
  document.body.appendChild(el);

  // 脈動 (呼吸): 単層の opacity アニメ = 合成のみで完結し inset glow の再ラスタライズは起きない。
  // reduce-motion 時はアニメ無し = 静止表示。
  if (motionAllowed()) {
    el.animate(
      [{ opacity: 0.55 }, { opacity: 1 }, { opacity: 0.55 }],
      { duration: 2800, iterations: Infinity, easing: "ease-in-out" },
    );
  }
};
