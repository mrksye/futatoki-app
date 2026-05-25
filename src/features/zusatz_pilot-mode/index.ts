/**
 * PilotMode (実験モード) の公開 API。ロジックも黒魔術 (視覚の DOM 注入) もこの 1 ディレクトリに同梱。
 *   - inPilotMode():              解錠済みかを読む (実験機能の出し分けに使う側が参照)。
 *   - knockingOnPilotModesDoor(): 解錠操作の入力を流し込む。解錠した瞬間に金色オーラを自分で召喚する。
 * 視覚は component として host に差し込まず golden-aura.ts が DOM へ直接ねじ込むので、ここには出さない。
 * 封印 / 削除手順は state.ts の冒頭コメントを参照。
 */
export { inPilotMode, knockingOnPilotModesDoor } from "./state";
