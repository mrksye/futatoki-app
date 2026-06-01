import { type Component } from "solid-js";
import { colorMode } from "../settings/color-mode";
import { paletteId } from "../settings/palette";
import { CENTER, clockRadius } from "../../components/clockface-layers/geometry";

/**
 * 開始点を示す、中心から盤面縁への放射線 1 本。塗りつぶしの扇の代わりに「ここから始まった」を細い線で示す。
 * ClockFace の children として残り扇と同じ層 (ベースと数字の間) に乗る。
 *  - variant "timerStart"  : たいむの開始点 (現在針から到達済みぶん戻した位置)。淡赤。
 *  - variant "interruption": 中断 (一時停止) を含めた真の開始点 (firstStartMs)。うっすい青。
 * 色は扇と同じく盤面背景で見え方が変わるので sector / 白盤面の 2 段に出し分ける。線は分位置に中央が乗る
 * 既定の中央ストロークで描く (片側に寄せない)。
 */

/** 開始点線の太さ (viewBox 340 基準)。 */
const START_LINE_WIDTH = 1;

interface TimerStartLineProps {
  /** 線を引く分位置 (小数可)。中心 → 盤面縁の放射線。 */
  minute: number;
  /** 起点の種類 (色の出し分け)。 */
  variant: "timerStart" | "interruption";
}

const TimerStartLine: Component<TimerStartLineProps> = (props) => {
  const isSector = () => colorMode() === "sector" && paletteId() !== "monotone";
  const color = () => {
    if (props.variant === "interruption") return isSector() ? "#dcdce8" : "#d3d3e0";
    return isSector() ? "#ffdada" : "#f3c8c8";
  };
  const rim = () => {
    const angle = ((props.minute * 6 - 90) * Math.PI) / 180;
    const radius = clockRadius();
    return { x: CENTER + radius * Math.cos(angle), y: CENTER + radius * Math.sin(angle) };
  };

  return (
    <line
      x1={CENTER}
      y1={CENTER}
      x2={rim().x}
      y2={rim().y}
      stroke={color()}
      stroke-width={START_LINE_WIDTH}
    />
  );
};

export default TimerStartLine;
