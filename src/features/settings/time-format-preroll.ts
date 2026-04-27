import { createEffect, createRoot, createSignal, on } from "solid-js";
import { timeFormat } from "./time-format";

/**
 * 12h ⇄ 24h トグル時の preroll の timing。
 *
 * 1. PULSE × 2  — 12 が黄金色に「ドゥンドゥドゥンッ」と 2 回光る (fill の色変化のみ)。
 * 2. SHOCKWAVE — 12 を震源に細いリングが外へ「パァッ」と広がる。
 * 3. SETTLE    — 静止 (余韻)。
 * …続いて time-format-animation.ts の stagger が始まる。
 *
 * prerollKey は各 toggle で +1 されるカウンタ (ClockFace / TimeFormatPrerollFx の effect 起点)。
 * TIME_FORMAT_PREROLL_MS は全 phase の合計で time-format-animation.ts の stagger 遅延に使う。
 */

export const PULSE_MS = 440;
export const SHOCKWAVE_MS = 320;
export const SETTLE_MS = 180;
export const TIME_FORMAT_PREROLL_MS = PULSE_MS * 2 + SHOCKWAVE_MS + SETTLE_MS;

const [prerollKey, setPrerollKey] = createSignal(0);

createRoot(() => {
  createEffect(on(timeFormat, () => {
    setPrerollKey((k) => k + 1);
  }, { defer: true }));
});

export { prerollKey };
