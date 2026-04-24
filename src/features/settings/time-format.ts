import { persistedSignal } from "../../lib/persisted-signal";

/**
 * 時刻フォーマット: 24h / 12h
 *
 * Public API:
 *   - accessor: timeFormat
 *   - action:   toggleTimeFormat
 *
 * 内部の生 setter (setTimeFormat) は意図的に export していない。
 * モジュール内でも生 setter を直接呼ばず、必ず action 経由で書き換えること。
 */

export type TimeFormat = "24h" | "12h";

// ===== Internal state =====
const [timeFormat, setTimeFormat] = persistedSignal<TimeFormat>("timeFormat", "24h");

// ===== Public accessor =====
export { timeFormat };

// ===== Public actions =====
export const toggleTimeFormat = () =>
  setTimeFormat(f => f === "24h" ? "12h" : "24h");
