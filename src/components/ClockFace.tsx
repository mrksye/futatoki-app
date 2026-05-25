import type { ParentComponent } from "solid-js";
import { useI18n } from "../i18n";
import { VIEW } from "./clockface-layers/geometry";
import BaseFace from "./clockface-layers/BaseFace";
import FaceDetail from "./clockface-layers/FaceDetail";

/**
 * 時計盤を 1 枚の SVG にレイヤー合成する facade。下から:
 *   BaseFace (ベゼル + 盤面 + 背景色) → children (差し込み層) → FaceDetail (区切りの色扇 / バッジ /
 *   分目盛り / メモリ / 時間数字)。SVG の paint 順 = レイヤー順。
 * children を渡さなければ従来どおりの盤面 (clock / 回転モード)。timer モードだけ TimerLayout が扇
 * <path> を children で挟み、ベースと数字の間にキレイな扇を作る (ClockFace 自体は timer を知らない)。
 *
 * role="img" + aria-label で SVG をひとつの画像として扱わせる。なしだと Googlebot や screen reader が
 * 中の <text> (1〜12, 1〜60) を本文として拾い、検索スニペットが「1 2 3 4 5 ...」になる事故が起きる。
 *
 * autoRotate 中は root に `.print-hands-hidden` が付き印刷時に針を消すが、それは HandsLayer 側の制御。
 */
interface ClockFaceProps {
  period: "am" | "pm" | "merged";
  /** vivid パレット時の AM/PM 配色判別用 (merged 時のみ参照)。 */
  hours: number;
}

const ClockFace: ParentComponent<ClockFaceProps> = (props) => {
  const { t } = useI18n();

  return (
    <div class="w-full h-full flex items-center justify-center">
      <svg
        viewBox={`0 0 ${VIEW} ${VIEW}`}
        class="w-full h-full"
        style="max-height: 100%; max-width: 100%;"
        role="img"
        aria-label={
          props.period === "am" ? t("a11y.clockFaceAm")
          : props.period === "pm" ? t("a11y.clockFacePm")
          : t("a11y.clockFace")
        }
      >
        <BaseFace period={props.period} />
        {props.children}
        <FaceDetail period={props.period} hours={props.hours} />
      </svg>
    </div>
  );
};

export default ClockFace;
