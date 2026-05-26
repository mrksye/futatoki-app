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
/** ベゼル (外側リング 2 枚) の配色。outer = 縁の影、inner = リング本体。period 既定色のほか、"gold" で
 *  タイマー盤用のクラシックな金時計ベゼル (宝箱から出てくる金時計の風合い)。 */
const BEZEL_COLORS: Record<"am" | "pm" | "merged", { outer: string; inner: string }> = {
  am: { outer: "#0060B0", inner: "#0080D8" },
  pm: { outer: "#C01850", inner: "#E02068" },
  merged: { outer: "#1a1a1a", inner: "#3a3a3a" },
};
const GOLD_BEZEL = { outer: "#8c6d1f", inner: "#d4af37" };

interface BaseFaceProps {
  period: "am" | "pm" | "merged";
  /** "gold" のときだけベゼルを金色にする (タイマー盤のクラシックな金時計ベゼル)。 */
  bezel?: "gold";
}

const BaseFace: Component<BaseFaceProps> = (props) => {
  const bezel = () => (props.bezel === "gold" ? GOLD_BEZEL : BEZEL_COLORS[props.period]);
  return (
    <>
      {/* 外側リング (SVG filter は重いのでシンプルな同心円 2 枚で縁取り) */}
      <circle cx={CENTER} cy={CENTER} r={outerRing() + 2} fill={bezel().outer} />
      <circle cx={CENTER} cy={CENTER} r={outerRing()} fill={bezel().inner} />

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
