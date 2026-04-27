import { persistedSignal } from "../../lib/persisted-signal";

/** 詳細モード: くわしく (外周に 1〜60 の分表示) / すっきり (非表示)。生 setter は未 export。 */
export type DetailMode = "kuwashiku" | "sukkiri";

const [detailMode, setDetailMode] = persistedSignal<DetailMode>("detailMode", "sukkiri");

export { detailMode };

export const toggleDetailMode = () =>
  setDetailMode(m => m === "kuwashiku" ? "sukkiri" : "kuwashiku");
