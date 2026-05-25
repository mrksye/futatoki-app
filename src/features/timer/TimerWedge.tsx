import { Show, type Component } from "solid-js";
import { colorMode } from "../settings/color-mode";
import { CENTER, clockRadius, pieSectorPath } from "../../components/clockface-layers/geometry";

/**
 * タイマー扇レイヤー。timer 盤の現在針 (黒) から終了マーカー (グレー) までの残り時間を、中心から盤面縁
 * までの扇 (pie) で塗る。ClockFace の children として BaseFace と FaceDetail の間に差し込まれ、背景色の
 * 上・色扇/バッジ/数字の下に乗る (数字は扇の上で読める)。
 *
 * 色は colorMode 依存: くぎりは白 (色扇が opacity 0.8 で上に重なるのでその区画が明るく抜ける)、ばっじは
 * 区切り盤面と同じグレー #ececec (白盤面の上に出す)。
 */
interface TimerWedgeProps {
  /** 現在針の位置 (分, 0..60 小数)。扇の始端。 */
  fromMinute: number;
  /** 残り時間 (分, 0..60 小数)。扇の角度幅 = これ × 6°。0 以下なら描かない。 */
  spanMinutes: number;
}

const TimerWedge: Component<TimerWedgeProps> = (props) => {
  const fill = () => (colorMode() === "sector" ? "#ffffff" : "#ececec");
  const startAngle = () => props.fromMinute * 6 - 90;
  return (
    <Show when={props.spanMinutes > 0}>
      {/* 残り 60 分ちょうど (= 全周) は arc 1 本で閉じられないので円で塗る。 */}
      <Show
        when={props.spanMinutes < 60}
        fallback={<circle cx={CENTER} cy={CENTER} r={clockRadius()} fill={fill()} />}
      >
        <path
          d={pieSectorPath(CENTER, CENTER, clockRadius(), startAngle(), startAngle() + props.spanMinutes * 6)}
          fill={fill()}
        />
      </Show>
    </Show>
  );
};

export default TimerWedge;
