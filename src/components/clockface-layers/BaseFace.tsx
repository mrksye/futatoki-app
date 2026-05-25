import { Show, type Component } from "solid-js";
import { colorMode } from "../../features/settings/color-mode";
import { paletteId } from "../../features/settings/palette";
import { CENTER, clockRadius, outerRing } from "./geometry";

/**
 * 時計盤の最下層レイヤー。ベゼル (外側リング 2 枚) + 文字盤の地 (背景色) だけを描く SVG フラグメント。
 * 区切りの色扇・バッジ・分目盛り・数字は FaceDetail 側、針は HandsLayer 側。タイマー扇はこの上・
 * FaceDetail の下に ClockFace の children として差し込まれる。
 *
 * ばっじモードの白盤面もここに含める: 背景色そのものなので、タイマー扇はこの白の「上」に乗る。
 */
interface BaseFaceProps {
  period: "am" | "pm" | "merged";
}

const BaseFace: Component<BaseFaceProps> = (props) => {
  return (
    <>
      {/* 外側リング (SVG filter は重いのでシンプルな同心円 2 枚で縁取り) */}
      <circle
        cx={CENTER} cy={CENTER} r={outerRing() + 2}
        fill={props.period === "merged" ? "#1a1a1a" : props.period === "pm" ? "#C01850" : "#0060B0"}
      />
      <circle
        cx={CENTER} cy={CENTER} r={outerRing()}
        fill={props.period === "merged" ? "#3a3a3a" : props.period === "pm" ? "#E02068" : "#0080D8"}
      />

      {/* 文字盤 (ものとーん時だけ真っ白で区切り線と同化させる) */}
      <circle
        cx={CENTER} cy={CENTER} r={clockRadius()}
        fill={
          paletteId() === "monotone"
            ? "#ffffff"
            : props.period === "merged" ? "#ececec" : props.period === "pm" ? "#f8d8e0" : "#d8e8f8"
        }
      />

      {/* ばっじモードの白盤面 (背景色)。この上にタイマー扇が乗り、さらに上にバッジ/数字が乗る。 */}
      <Show when={colorMode() === "badge"}>
        <circle cx={CENTER} cy={CENTER} r={clockRadius()} fill="#ffffff" />
      </Show>
    </>
  );
};

export default BaseFace;
