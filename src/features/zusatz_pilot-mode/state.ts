import { createSignal } from "solid-js";
import { PILOT_SEQUENCE } from "./sequence";
import { summonGoldenAura } from "./golden-aura";
import { showPilotModeToast } from "./toast";

/**
 * PilotMode (= 実験モード / ExperimentalMode) の状態と解錠検出。開発中・実験的な機能を、知っている人
 * だけが触れるよう出し分けるための汎用ゲート。特定の機能には結合しない自己完結モジュールで、何を
 * 出すかは「読む側」が inPilotMode() を見て各自で決める。
 *
 * 永続化しない (session 限りの signal)。解錠はリロード / 再起動でのみ解け、localStorage 等に痕跡を
 * 残さない。解錠を途中で解く API はあえて持たない (= リロード以外で戻る手段はない)。
 *
 * 結合点 (公開 API はこの 2 関数だけ。視覚は host に差し込まず DOM へ直接ねじ込む = JSX 行は増えない):
 *   - knockingOnPilotModesDoor(id): 解錠操作の入力 (配色ボタンが押されるたびに id を流し込む)。最後の
 *     1 手で解錠した瞬間、golden-aura.ts が金色オーラを、toast.ts が下部トーストを document.body へ
 *     直接ねじ込む (黒魔術 = host に行を足さない)。
 *   - inPilotMode():               解錠済みかを読む (実験機能の出し分けに使う側が参照)。
 *
 * ── 手早く封印するだけ (1 行削除 + 警告) ──
 *   knockingOnPilotModesDoor(...) の呼び出し 1 行を消すだけ。解錠経路が断たれて inPilotMode は永久に
 *   false になり、ゲートの先の実験機能も視覚もすべて出なくなる。残った import が unused 警告になるだけ。
 *
 * ── 痕跡ゼロで完全削除 (詳細は同ディレクトリ README.md) ──
 *   この src/features/zusatz_pilot-mode/ ディレクトリを丸ごと消す → 参照が壊れてエラーになった行
 *   (ModePicker / SettingsPopover) を削る。それで終わり。差し込み先の body にはコメントを置いていない
 *   ので、エラー行だけが手がかりになる。
 */

const [inPilotMode, setInPilotMode] = createSignal(false);

export { inPilotMode };

/** 直近まで何個連続で正解したか (PILOT_SEQUENCE への前方一致の進捗)。 */
let progress = 0;

/**
 * 配色ボタンが押されるたびに呼ぶ。PILOT_SEQUENCE と前方一致で進め、最後まで揃ったら解錠。
 * 外した手は、それ自体が先頭の手なら 1 から数え直す (押し間違えても直後の正しい連打で復帰できる)、
 * そうでなければ 0 に戻す。解錠後は no-op。
 */
export const knockingOnPilotModesDoor = (paletteId: string): void => {
  if (inPilotMode()) return;
  if (paletteId === PILOT_SEQUENCE[progress]) {
    progress += 1;
    if (progress >= PILOT_SEQUENCE.length) {
      progress = 0;
      setInPilotMode(true);
      summonGoldenAura();
      showPilotModeToast();
    }
    return;
  }
  progress = paletteId === PILOT_SEQUENCE[0] ? 1 : 0;
};
