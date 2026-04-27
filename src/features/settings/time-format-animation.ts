import { createEffect, createRoot, createSignal, on } from "solid-js";
import { motionAllowed } from "../../lib/motion";
import { timeFormat, type TimeFormat } from "./time-format";
import { TIME_FORMAT_PREROLL_MS } from "./time-format-preroll";

/**
 * 12h ⇄ 24h トグルを「右回りにポポポポポッ」と切り替えるための表示ステート。timeFormat() を直接
 * 使うと PM 盤面の 11 個の数字が一斉に切り替わるので、ポジション (0..11) ごとの「現在表示中の
 * format」を別 signal で持って時計回りに stagger flip する。
 *
 * 連打耐性: timeFormat 変化のたびに pendingTimers を全 cancel して新 target で再スケジュール。
 * 既に target と同値のポジションは setTimeout 内で signal に同値を渡すので Solid の === 等価
 * チェックで reactive 伝播せず無駄なバウンスは発火しない。
 */

const NUM_POSITIONS = 12;

/** 隣接ポジション間の遅延 (ms)。「ポポポポポッ」感の決め手。 */
const STAGGER_MS = 50;

const [displayedFormats, setDisplayedFormats] = createSignal<TimeFormat[]>(
  Array(NUM_POSITIONS).fill(timeFormat()),
);

const pendingTimers: ReturnType<typeof setTimeout>[] = [];

const cancelPending = () => {
  while (pendingTimers.length) clearTimeout(pendingTimers.pop()!);
};

const setAt = (position: number, format: TimeFormat) => {
  setDisplayedFormats((prev) => {
    if (prev[position] === format) return prev;
    const next = prev.slice();
    next[position] = format;
    return next;
  });
};

createRoot(() => {
  createEffect(on(timeFormat, (current) => {
    cancelPending();
    // ポジション 0 (12 時) は値が "12" 固定で見た目変化なしだが、内部状態は最新 format に同期。
    setAt(0, current);
    // 12 ドゥンドゥドゥンッ + パァッ衝撃波 (TimeFormatPrerollFx + ClockFace 内 12 fill アニメ) が
    // 終わってから stagger を始める。reduce-motion 時は preroll 演出をスキップするので遅延も 0。
    const prerollDelay = motionAllowed() ? TIME_FORMAT_PREROLL_MS : 0;
    for (let position = 1; position < NUM_POSITIONS; position++) {
      const pos = position;
      const id = setTimeout(
        () => setAt(pos, current),
        prerollDelay + pos * STAGGER_MS,
      );
      pendingTimers.push(id);
    }
  }, { defer: true }));
});

export const displayedFormatAt = (position: number): TimeFormat =>
  displayedFormats()[position] ?? timeFormat();
