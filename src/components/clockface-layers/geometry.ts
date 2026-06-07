import { colorMode } from "../../features/settings/color-mode";
import { detailMode } from "../../features/settings/detail-mode";
import { paletteId } from "../../features/settings/palette";

/**
 * 時計盤レイヤー (BaseFace / FaceDetail / タイマー扇) が共有する SVG ジオメトリ。
 * すべて viewBox 340x340 / 中心 (170,170) を基準に、detailMode (くわしく/すっきり) と
 * colorMode (くぎり/ばっじ) × palette でラジアスが変わる。各 getter は signal を読むので
 * reactive context で呼べばそのまま追従する。
 */

export const VIEW = 340;
export const CENTER = VIEW / 2;

/** ばっじ円の半径。すっきりで一回り大きく (数字 font-size と一緒にスケールさせる)。 */
export const BADGE_RADIUS_KUWASHIKU = 18;
export const BADGE_RADIUS_SUKKIRI = 21;

export const isKuwashiku = () => detailMode() === "kuwashiku";
/** monotone × badge は「文字盤自体がバッジ化」する特別仕様 (個別 badge 円を出さない)。 */
export const isMonotoneBadge = () => colorMode() === "badge" && paletteId() === "monotone";

/** くわしくは時計を縮めて外に分数字スペースを確保、すっきりは画面いっぱい。 */
export const clockRadius = () => (isKuwashiku() ? 130 : 148);

/** 時間数字を置く半径。ばっじ×すっきりは badge 半径が膨らむので外周はみ出し回避で内側へ引き込む。
 *  monotone × badge は cardinal 数字を縁からさらに内側へ寄せて中央に呼吸を作る。 */
export const numberRadius = () => {
  if (isMonotoneBadge()) return clockRadius() - 34;
  return clockRadius() - (colorMode() === "badge" && !isKuwashiku() ? BADGE_RADIUS_SUKKIRI : 18);
};

export const bandInner = () => numberRadius() - 16;
export const bandOuter = () => clockRadius();
export const outerRing = () => clockRadius() + 3;
export const minuteNumberRadius = () => clockRadius() + 20;

/**
 * 針長 factor (clockRadius との比) を detailMode × colorMode の 4 通りで個別に持つ。
 * くわしく/すっきり (clockRadius が 130 / 148) と くぎり/ばっじ (数字外端の幾何が違う) で
 * 「針 tip と数字/badge 内端の距離」が揃わないので、4 mode 個別に微調整する。Kawaii 担保用。
 * 針描画 (HandsLayer) とタイマー扇 (TimerWedge, 長針に合わせて半径を決める) が共有する。
 */
type HandModeKey = "kuwashiku-sector" | "kuwashiku-badge" | "sukkiri-sector" | "sukkiri-badge";
const HAND_FACTORS: Record<HandModeKey, { hour: number; minute: number }> = {
  "kuwashiku-sector": { hour: 0.49, minute: 0.79 },
  "kuwashiku-badge":  { hour: 0.46, minute: 0.75 },
  "sukkiri-sector":   { hour: 0.48, minute: 0.78 },
  "sukkiri-badge":    { hour: 0.45, minute: 0.73 },
};

/** monotone × badge は「文字盤自体がバッジ化」する特別仕様で針長も別 (長針: 円盤縁の minute tick 内端ギリギリ /
 *  短針: cardinal 数字の inner edge に round linecap が触れる位置)。通常モードの hour:minute 比 (~0.61) にも自然に揃う。 */
const MONOTONE_BADGE_HAND_FACTORS: Record<"kuwashiku" | "sukkiri", { hour: number; minute: number }> = {
  "kuwashiku": { hour: 0.55, minute: 0.90 },
  "sukkiri":   { hour: 0.57, minute: 0.91 },
};

/** 現在モードの針長 factor (hour / minute)。 */
export const handFactors = (): { hour: number; minute: number } => {
  if (isMonotoneBadge()) return MONOTONE_BADGE_HAND_FACTORS[detailMode()];
  return HAND_FACTORS[`${detailMode()}-${colorMode()}` as HandModeKey];
};

/** 分針 (長針) の中心からの長さ (viewBox 単位)。タイマー扇はこれを基準に「気持ち短い」半径で描く。 */
export const minuteHandLength = () => clockRadius() * handFactors().minute;

/** 時針 (短針) の中心からの長さ (viewBox 単位)。開始点線はこの少し外側から引いて短針に触れないようにする。 */
export const hourHandLength = () => clockRadius() * handFactors().hour;

export function hourToAngle(hour: number): number {
  return (hour / 12) * 360 - 90;
}

/** 中空の扇 (annular sector)。区切りモードの時間色帯に使う。 */
export function annularSectorPath(
  centerX: number, centerY: number,
  innerRadius: number, outerRadius: number,
  startAngleDeg: number, endAngleDeg: number,
): string {
  const s = (startAngleDeg * Math.PI) / 180;
  const e = (endAngleDeg * Math.PI) / 180;
  const ox1 = centerX + outerRadius * Math.cos(s);
  const oy1 = centerY + outerRadius * Math.sin(s);
  const ox2 = centerX + outerRadius * Math.cos(e);
  const oy2 = centerY + outerRadius * Math.sin(e);
  const ix1 = centerX + innerRadius * Math.cos(e);
  const iy1 = centerY + innerRadius * Math.sin(e);
  const ix2 = centerX + innerRadius * Math.cos(s);
  const iy2 = centerY + innerRadius * Math.sin(s);
  const largeArc = endAngleDeg - startAngleDeg > 180 ? 1 : 0;
  return [
    `M ${ox1} ${oy1}`,
    `A ${outerRadius} ${outerRadius} 0 ${largeArc} 1 ${ox2} ${oy2}`,
    `L ${ix1} ${iy1}`,
    `A ${innerRadius} ${innerRadius} 0 ${largeArc} 0 ${ix2} ${iy2}`,
    "Z",
  ].join(" ");
}

/** 中心から半径まで塗りつぶす扇 (pie)。タイマー扇に使う。startAngleDeg→endAngleDeg を時計回りに。 */
export function pieSectorPath(
  centerX: number, centerY: number, radius: number,
  startAngleDeg: number, endAngleDeg: number,
): string {
  const s = (startAngleDeg * Math.PI) / 180;
  const e = (endAngleDeg * Math.PI) / 180;
  const x1 = centerX + radius * Math.cos(s);
  const y1 = centerY + radius * Math.sin(s);
  const x2 = centerX + radius * Math.cos(e);
  const y2 = centerY + radius * Math.sin(e);
  const largeArc = endAngleDeg - startAngleDeg > 180 ? 1 : 0;
  return `M ${centerX} ${centerY} L ${x1} ${y1} A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2} Z`;
}
