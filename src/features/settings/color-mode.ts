import { persistedSignal } from "../../lib/persisted-signal";

/**
 * いろの表示モード: くぎり (扇形) / ばっじ (各時間に色付き丸)
 *
 * Public API:
 *   - accessor: colorMode
 *   - action:   toggleColorMode
 *
 * 内部の生 setter (setColorMode) は意図的に export していない。
 * モジュール内でも生 setter を直接呼ばず、必ず action 経由で書き換えること。
 * 新しい振る舞いが必要なら、新しい action を追加して export する。
 *
 * (この規律は Effect / TanStack 等が採用している
 *  "module-private state + semantic actions" パターンに倣ったもの)
 */

export type ColorMode = "sector" | "badge";

// ===== Internal state (raw setter is intentionally not exported) =====
const [colorMode, setColorMode] = persistedSignal<ColorMode>("colorMode", "sector");

// ===== Public accessor (read-only) =====
export { colorMode };

// ===== Public actions (only valid mutations live here) =====
export const toggleColorMode = () =>
  setColorMode(c => c === "sector" ? "badge" : "sector");
