import { type Component } from "solid-js";
import { colorMode } from "../settings/color-mode";
import { paletteId } from "../settings/palette";
import { CENTER, hourHandLength, timerWedgeRadius } from "../../components/clockface-layers/geometry";

/**
 * 開始点を示す放射状の線 1 本。塗りつぶしの扇の代わりに「ここから始まった」を細い線で示す。針・中心ネジで
 * 混む中心付近は空け、短針 (時針) の先のすぐ外 (hourHandLength + HOUR_HAND_CLEARANCE) から、扇と同じ外端
 * (timerWedgeRadius) までの帯だけ引く。内端は短針長・外端は扇半径に追従するので、どの mode でも短針に触れず
 * 外周からも扇と同じだけ引っ込む。ClockFace の children として残り扇と同じ層 (ベースと数字の間) に乗る。
 *  - variant "timerStart"  : たいむの開始点 (現在針から到達済みぶん戻した位置)。
 *  - variant "interruption": 中断 (一時停止) を含めた真の開始点 (firstStartMs)。
 * 色は盤面背景で見え方が変わるので 2 段に出し分けるが、variant では分けない: グレー盤 (くぎり) は両方とも白、
 * 白盤 (ばっじ / ものとーん) は両方とも落ち着いたグレーで引く。線は分位置に中央が乗る
 * 既定の中央ストロークで描く (片側に寄せない)。
 */

/** 開始点線の太さ (viewBox 340 基準)。 */
const START_LINE_WIDTH = 1;
/** 白盤 (ばっじ / ものとーん) で両開始点線に共通の薄いブルーグレー。白に溶けず黒ほど強くなく、ほんのり青み。 */
const WHITE_BOARD_LINE_COLOR = "#cacdd6";
/** 線の内端を短針の先からどれだけ外へ離すか (viewBox 340 基準)。短針の丸キャップ半径 (5) ぶんを越えてから
 *  ほんの少しだけ間を空け、どの mode でも短針にギリギリ触れない最短の隙間にする。 */
const HOUR_HAND_CLEARANCE = 12;

interface TimerStartLineProps {
  /** 線を引く分位置 (小数可)。中心 → 盤面縁の放射線。 */
  minute: number;
  /** 起点の種類 (色の出し分け)。 */
  variant: "timerStart" | "interruption";
}

const TimerStartLine: Component<TimerStartLineProps> = (props) => {
  const isSector = () => colorMode() === "sector" && paletteId() !== "monotone";
  const color = () => {
    // くぎり (ものとーん除く) は盤面に opacity 0.8 の色扇が乗りグレー寄りに沈むので、その上で読めるよう両方とも
    // 純白にする (青赤の区別はここでは捨てる)。白盤 (ばっじ / ものとーん) では青 (中断) / 赤 (消費開始) で区別せず、
    // 両方とも同じ落ち着いたグレーで引く (白に溶けず黒ほど強くない中間)。
    if (isSector()) return "#ffffff";
    return WHITE_BOARD_LINE_COLOR;
  };
  // 中心側 (inner) は針まわりを避けるため START_LINE_INNER_RADIUS だけ離し、外周側 (rim) は盤面縁まで。
  const segment = () => {
    const angle = ((props.minute * 6 - 90) * Math.PI) / 180;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const outer = timerWedgeRadius();
    const inner = hourHandLength() + HOUR_HAND_CLEARANCE;
    return {
      x1: CENTER + inner * cos,
      y1: CENTER + inner * sin,
      x2: CENTER + outer * cos,
      y2: CENTER + outer * sin,
    };
  };

  return (
    <line
      x1={segment().x1}
      y1={segment().y1}
      x2={segment().x2}
      y2={segment().y2}
      stroke={color()}
      stroke-width={START_LINE_WIDTH}
    />
  );
};

export default TimerStartLine;
