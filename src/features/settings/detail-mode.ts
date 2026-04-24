import { persistedSignal } from "../../lib/persisted-signal";

/**
 * 詳細モード: くわしく (外周に1-60の分表示) / すっきり (非表示)
 *
 * Public API:
 *   - accessor: detailMode
 *   - action:   toggleDetailMode
 *
 * 内部の生 setter (setDetailMode) は意図的に export していない。
 * モジュール内でも生 setter を直接呼ばず、必ず action 経由で書き換えること。
 */

export type DetailMode = "kuwashiku" | "sukkiri";

// ===== Internal state =====
const [detailMode, setDetailMode] = persistedSignal<DetailMode>("detailMode", "kuwashiku");

// ===== Public accessor =====
export { detailMode };

// ===== Public actions =====
export const toggleDetailMode = () =>
  setDetailMode(m => m === "kuwashiku" ? "sukkiri" : "kuwashiku");
