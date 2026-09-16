import { createSignal } from "solid-js";
import { clockMode, rotateMinutes } from "./state";

/**
 * じどうかいてん (autoRotate) を眺めている間だけ効く「読み取り補助」の 2 軸。盤面を眺めながら
 * 「いま何分？」「短針だけ見て何時？」を練習するための表示オプションで、
 *
 *   numeralEmphasis : いまかかっている分数 / 時数だけをほんの少し大きく描く
 *   handFade        : 短針 / 長針のどちらかをほぼ見えない濃さまで薄める
 *
 * の 2 つ。互いに直交する (分数を強調しながら短針を薄める、が成り立つ) ので 1 つの状態に畳まず
 * 別々の signal のまま持つ。永続化なし (セッション内のみ)。
 *
 * 他モードへの持ち越しは構造で禁じている: 公開 accessor は必ず clockMode() === "autoRotate" を
 * 通してから生 signal を読むので、とけい / じゆう / たいむ では値が何であれ "none" に倒れる。
 * 生 signal と生 accessor は未 export で、読み手が guard を飛ばす余地が無い。じどうかいてんへ
 * 戻ってきた時は選んだ値がそのまま効く (モードを跨がないだけで、モード内では選択が生きる)。
 *
 * 強調対象は rotateMinutes から直接引く。じどうかいてん中の表示時刻は
 * computeVisibleMinutes(m, moving=true) = m そのものなので、針が指している位置と強調される
 * 数字は定義上ずれない。
 */

/** 数字の強調対象。"minute" = 分数 (1..60)、"hour" = 時数 (盤の 12 ポジション)。 */
export type NumeralEmphasis = "none" | "minute" | "hour";

/** 薄める針。"hour" = 短針、"minute" = 長針。 */
export type HandFade = "none" | "hour" | "minute";

/** 薄めた針の不透明度。白い縁取りごと薄めるので、盤の色によらず「見えてるか見えてないか
 *  分からない」ぎりぎりの濃さに置く。完全な 0 にしないのは、答え合わせのとき自分で確かめられる
 *  余地を残すため。 */
const FADED_HAND_OPACITY = 0.035;

const [numeralEmphasisValue, selectNumeralEmphasis] = createSignal<NumeralEmphasis>("none");
const [handFadeValue, selectHandFade] = createSignal<HandFade>("none");

export { selectNumeralEmphasis, selectHandFade };

const inAutoRotate = () => clockMode() === "autoRotate";

/** いま有効な数字強調。じどうかいてん外では常に "none"。 */
export const numeralEmphasis = (): NumeralEmphasis =>
  inAutoRotate() ? numeralEmphasisValue() : "none";

/** いま有効な針の薄め。じどうかいてん外では常に "none"。 */
export const handFade = (): HandFade =>
  inAutoRotate() ? handFadeValue() : "none";

/**
 * 強調する分数 (1..60)。いま「かかっている」分 = floor なので、長針が 13 と 14 の間にいる間は
 * ずっと 13 が大きいまま (読み取った答えと一致する)。ちょうど 0 分台は盤の真上に 60 と描かれて
 * いるので 60 を返す。強調オフ / じどうかいてん外は null。
 */
export const emphasizedMinuteNumber = (): number | null => {
  if (numeralEmphasis() !== "minute") return null;
  const minuteOfHour = Math.floor(rotateMinutes() % 60);
  return minuteOfHour === 0 ? 60 : minuteOfHour;
};

/**
 * 強調する時数のポジション (0..11、0 が盤の真上)。分数と同じく「かかっている」時 = floor で、
 * 短針が 3 と 4 の間にいる間はずっと 3 が大きいまま。ポジションで返すのは 12h/24h 表記で
 * 描かれる数値が変わっても位置は変わらないため。強調オフ / じどうかいてん外は null。
 */
export const emphasizedHourPosition = (): number | null => {
  if (numeralEmphasis() !== "hour") return null;
  return Math.floor(rotateMinutes() / 60) % 12;
};

/** 針の不透明度。薄める対象に選ばれていなければ 1 (通常の濃さ)。 */
export const handOpacity = (hand: "hour" | "minute"): number =>
  handFade() === hand ? FADED_HAND_OPACITY : 1;
