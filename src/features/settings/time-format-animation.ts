import { createEffect, createRoot, createSignal, on } from "solid-js";
import { timeFormat, type TimeFormat } from "./time-format";

/**
 * 12h ⇄ 24h トグルを「右回りにポポポポポッ」と切り替えるための表示ステート。
 *
 * 通常 timeFormat() を使うと PM 盤面の 11 個の数字が一斉に切り替わってしまう。
 * これを時計回りで 1 つずつフリップさせるため、ポジション (0..11) ごとの
 * 「現在表示中の format」を別 signal で持つ。
 *
 * Public API:
 *   - displayedFormatAt(position): そのポジションで今表示している format
 *
 * 連打耐性:
 *   timeFormat が変わるたびに pendingTimers を全 cancel し、新 target で再スケジュール。
 *   既に target と同値のポジションは setTimeout 内で signal に同値を渡すので、
 *   Solid の === 等価チェックで reactive 伝播せず、無駄なバウンスは発火しない。
 *
 * (「分離できるものは常に分離する」原則: timeFormat は state、staggered display は
 *  animation policy。別ファイルに分けて、time-format.ts を変更不要に保つ)
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
    // ポジション 0 (= 12 時の位置) は値が "12" 固定で見た目は変わらないが、
    // 内部状態は最新 format に同期しておく (将来 12h/24h で表示が分岐した時のため)。
    setAt(0, current);
    // ポジション 1..11 を時計回りに stagger でフリップ。
    for (let position = 1; position < NUM_POSITIONS; position++) {
      const pos = position;
      const id = setTimeout(() => setAt(pos, current), pos * STAGGER_MS);
      pendingTimers.push(id);
    }
  }, { defer: true }));
});

export const displayedFormatAt = (position: number): TimeFormat =>
  displayedFormats()[position] ?? timeFormat();
