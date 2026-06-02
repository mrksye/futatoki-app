import { type Component } from "solid-js";
import { colorMode } from "../settings/color-mode";
import { paletteId } from "../settings/palette";
import { CENTER, clockRadius, isKuwashiku } from "../../components/clockface-layers/geometry";

/**
 * 開始点を示す放射状の線 1 本。塗りつぶしの扇の代わりに「ここから始まった」を細い線で示す。針・中心ネジで
 * 混む中心付近は空け、盤面半径の START_LINE_INNER_RATIO_* から盤面縁までの外周側だけ引く。
 * ClockFace の children として残り扇と同じ層 (ベースと数字の間) に乗る。
 *  - variant "timerStart"  : たいむの開始点 (現在針から到達済みぶん戻した位置)。淡赤。
 *  - variant "interruption": 中断 (一時停止) を含めた真の開始点 (firstStartMs)。うっすい青。
 * 色は扇と同じく盤面背景で見え方が変わるので sector / 白盤面の 2 段に出し分ける。線は分位置に中央が乗る
 * 既定の中央ストロークで描く (片側に寄せない)。
 */

/** 開始点線の太さ (viewBox 340 基準)。 */
const START_LINE_WIDTH = 1;
/** 中心側を空ける割合 (盤面半径に対する比)。針・中心ネジで混む中央を空け、外周側だけ引く。
 *  すっきりは盤面が一回り大きく中央の余白も広いので、くわしくより少しだけ深く空けて見た目を揃える。 */
const START_LINE_INNER_RATIO_KUWASHIKU = 0.4;
const START_LINE_INNER_RATIO_SUKKIRI = 0.46;

interface TimerStartLineProps {
  /** 線を引く分位置 (小数可)。中心 → 盤面縁の放射線。 */
  minute: number;
  /** 起点の種類 (色の出し分け)。 */
  variant: "timerStart" | "interruption";
}

const TimerStartLine: Component<TimerStartLineProps> = (props) => {
  const isSector = () => colorMode() === "sector" && paletteId() !== "monotone";
  const color = () => {
    // くぎり (ものとーん除く) は盤面に opacity 0.8 の色扇が乗りグレー寄りに沈むので、その上で読めるよう
    // 両方とも純白にして視認性を最大化する。青赤の区別はここでは捨てる。
    if (props.variant === "interruption") return isSector() ? "#ffffff" : "#d3d3e0";
    return isSector() ? "#ffffff" : "#f3c8c8";
  };
  // 中心側 (inner) は針まわりを避けるため START_LINE_INNER_RADIUS だけ離し、外周側 (rim) は盤面縁まで。
  const segment = () => {
    const angle = ((props.minute * 6 - 90) * Math.PI) / 180;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const outer = clockRadius();
    const inner = outer * (isKuwashiku() ? START_LINE_INNER_RATIO_KUWASHIKU : START_LINE_INNER_RATIO_SUKKIRI);
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
