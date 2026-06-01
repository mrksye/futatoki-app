import { Show, type Component } from "solid-js";
import { colorMode } from "../settings/color-mode";
import { paletteId } from "../settings/palette";
import { CENTER, clockRadius, pieSectorPath } from "../../components/clockface-layers/geometry";

/**
 * 中断 (一時停止) の積算時間を示すうっすい青の扇。タイマーを最初に押した時刻 (firstStartMs, 不動の起点) を
 * 基準に、これまで積み上がった中断ぶんを盤の最背面にフラット塗りする。残り/到達済みの赤い扇 (TimerWedge) が
 * 実時刻で前へドリフトした後ろに覗くことで「タイマーが何分止まっていたか」を見せる。「さいかい」をまたいでも
 * 起点が動かないので積算が保たれる。
 *
 * 単一の pie パス 1 枚で描く (TimerWedge の 1 分バンド分割は使わない)。中断はアプリを開いたまま長時間放置すれば
 * 際限なく積み上がり得るので、分ごとに要素を作ると DOM が際限なく膨らむ。1 枚で描き、幅は呼び出し側で「盤の
 * 空き (60 − 選択分)」に頭打ちさせて 1 周を超えさせない (= 常に 360° 未満の正しい扇)。座標化する角度も呼び出し側で
 * 有界な分位置に保つ前提 (巨大 timestamp をそのまま三角関数に入れて精度を崩さない)。
 */

interface TimerInterruptionArcProps {
  /** 扇の始端 (分)。呼び出し側で有界 (おおよそ -60..60) に保つ。 */
  fromMinute: number;
  /** 中断ぶんの分幅 (盤の空きに頭打ち済み, 0..60 未満)。0 以下なら描かない。 */
  spanMinutes: number;
}

const TimerInterruptionArc: Component<TimerInterruptionArcProps> = (props) => {
  const isSector = () => colorMode() === "sector" && paletteId() !== "monotone";
  // 赤い弧と一目で別物 (止まっていた時間) と分かるうっすい青。sector / 白盤面で 2 段に出し分ける。
  const fill = () => (isSector() ? "#dcdce8" : "#d3d3e0");
  const path = () =>
    pieSectorPath(
      CENTER,
      CENTER,
      clockRadius(),
      props.fromMinute * 6 - 90,
      (props.fromMinute + props.spanMinutes) * 6 - 90,
    );

  return (
    <Show when={props.spanMinutes > 0}>
      <path d={path()} fill={fill()} />
    </Show>
  );
};

export default TimerInterruptionArc;
