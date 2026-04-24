import { persistedSignal } from "../../lib/persisted-signal";
import { DEFAULT_PALETTE_ID, getPalette, palettes } from "../../colors";

/**
 * カラーパレット選択。
 *
 * Public API:
 *   - accessor: paletteId
 *   - action:   cyclePalette, selectPalette
 *
 * 内部の生 setter (setPaletteIdRaw) は意図的に export していない。
 * モジュール内でも生 setter を直接呼ばず、必ず action 経由で書き換えること。
 * action 側で「存在しない id はデフォルトに正規化」等のドメインルールを担保している。
 */

// ===== Internal state =====
const [paletteId, setPaletteIdRaw] = persistedSignal<string>("paletteId", DEFAULT_PALETTE_ID);

// 永続化されている id が現存しないパレットを指していたらデフォルトに戻す。
// (アプリのバージョンアップで古い id が消えた場合のセーフガード)
if (!palettes.some(p => p.id === paletteId())) {
  setPaletteIdRaw(DEFAULT_PALETTE_ID);
}

// ===== Public accessor =====
export { paletteId };

// ===== Public actions =====

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
