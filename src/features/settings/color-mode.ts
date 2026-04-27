import { persistedSignal } from "../../lib/persisted-signal";

/** いろの表示モード: くぎり (扇形) / ばっじ (各時間に色付き丸)。生 setter は未 export。 */
export type ColorMode = "sector" | "badge";

const [colorMode, setColorMode] = persistedSignal<ColorMode>("colorMode", "badge");

export { colorMode };

export const toggleColorMode = () =>
  setColorMode(c => c === "sector" ? "badge" : "sector");
