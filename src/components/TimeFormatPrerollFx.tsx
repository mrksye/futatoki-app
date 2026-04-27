import { createEffect, on } from "solid-js";
import type { Component } from "solid-js";
import {
  prerollKey,
  PULSE_MS,
  SHOCKWAVE_MS,
} from "../features/settings/time-format-preroll";
import { animateMotion } from "../lib/motion";

/**
 * 12h ⇄ 24h トグル時の preroll: 12 を震源にした衝撃波リング担当。
 * 12 自体の色変化 (ドゥンドゥドゥンッ) は ClockFace 側で <text> の fill を直接アニメしているので、
 * ここは 2 度のネオン点灯が終わった直後にふわっと外へ抜ける「パァッ」リングだけを描く。
 *
 * fill / blur / drop-shadow / filter 系は重いので不使用、stroke + opacity だけで衝撃波を表現する。
 */

interface Props {
  /** てっぺん 12 の中心 (SVG viewBox 単位) */
  centerX: number;
  centerY: number;
}

const TimeFormatPrerollFx: Component<Props> = (props) => {
  let ringRef: SVGCircleElement | undefined;

  createEffect(on(prerollKey, () => {
    if (!ringRef) return;
    ringRef.getAnimations().forEach((a) => a.cancel());

    // ネオン点灯 2 周が完全に終わった瞬間 (delay = PULSE_MS * 2) に外へふわっと抜ける衝撃波。
    animateMotion(
      ringRef,
      [
        { transform: "scale(0.15)", opacity: 0 },
        { transform: "scale(0.9)",  opacity: 0.95, offset: 0.30 },
        { transform: "scale(1.6)",  opacity: 0 },
      ],
      {
        delay: PULSE_MS * 2,
        duration: SHOCKWAVE_MS,
        easing: "cubic-bezier(0.2, 0.6, 0.3, 1)",
        fill: "forwards",
      },
    );
  }, { defer: true }));

  return (
    <g
      style={{ "pointer-events": "none" }}
      transform={`translate(${props.centerX}, ${props.centerY})`}
    >
      <circle
        ref={ringRef}
        cx="0"
        cy="0"
        r="22"
        fill="none"
        stroke="#80FFC0"
        stroke-width="3.5"
        opacity="0"
        style={{
          "transform-box": "fill-box",
          "transform-origin": "center",
        }}
      />
    </g>
  );
};

export default TimeFormatPrerollFx;
