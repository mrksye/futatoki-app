import { persistedSignal } from "../../lib/persisted-signal";

/** 時刻フォーマット: 24h / 12h。生 setter は未 export。 */
export type TimeFormat = "24h" | "12h";

const [timeFormat, setTimeFormat] = persistedSignal<TimeFormat>("timeFormat", "12h");

export { timeFormat };

export const toggleTimeFormat = () =>
  setTimeFormat(f => f === "24h" ? "12h" : "24h");
