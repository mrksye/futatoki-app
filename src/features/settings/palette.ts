import { persistedSignal } from "../../lib/persisted-signal";
import { DEFAULT_PALETTE_ID, getPalette, palettes } from "../../colors";

/**
 * カラーパレット選択。生 setter (setPaletteIdRaw) は未 export。action 側で「存在しない id は
 * デフォルトに正規化」等のドメインルールを担保するので、モジュール内でも action 経由で書き換える。
 */

const [paletteId, setPaletteIdRaw] = persistedSignal<string>("paletteId", DEFAULT_PALETTE_ID);

// 永続化された id が現存しないパレットを指していたらデフォルトへ (バージョンアップで id 消失時の保険)。
if (!palettes.some(p => p.id === paletteId())) {
  setPaletteIdRaw(DEFAULT_PALETTE_ID);
}

export { paletteId };

/** 次のパレットへ循環。「べつのいろ」ボタン用。 */
export const cyclePalette = () => {
  const idx = palettes.findIndex(p => p.id === paletteId());
  const next = palettes[(idx + 1) % palettes.length]!.id;
  setPaletteIdRaw(next);
};

/** 特定のパレットを直接選択。存在しない id はデフォルトに正規化。 */
export const selectPalette = (id: string) => {
  setPaletteIdRaw(getPalette(id).id);
};
