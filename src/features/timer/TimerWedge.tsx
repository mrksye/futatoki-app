import { Index, Show, createMemo, type Component } from "solid-js";
import { colorMode } from "../settings/color-mode";
import { paletteId } from "../settings/palette";
import { CENTER, clockRadius, pieSectorPath } from "../../components/clockface-layers/geometry";
import { lerpColor } from "../../lib/color";

/**
 * タイマー扇レイヤー。timer 盤の現在針 (グレー) から終了マーカー (黒) までの残り時間を、中心から盤面縁
 * までの扇 (pie) で塗る。ClockFace の children として BaseFace と FaceDetail の間に差し込まれ、背景色の
 * 上・色扇/バッジ/数字の下に乗る (数字は扇の上で読める)。
 *
 * 色: 終了マーカー (終了点) を一番濃く、そこから離れるほど薄くした残り時間グラデーション。濃い端は
 * 盤面の背景で見え方が変わるので 2 段に出し分ける。非ものとーんのくぎり (盤面に opacity 0.8 の色扇が
 * 乗る) では、その色扇を明るく抜くために明るめの淡赤 #ffdada。ばっじ / ものとーん (盤面が白) では白に
 * 溶けないよう少し濃いめの淡赤 #f3c8c8。薄い端はそれぞれをさらに白寄りへ薄めた色。
 *
 * 帯の割り方: 色のくぎりは時計盤の 1 分目盛 (絶対角度 = 分 × 6°) にそろえる。現在針 (fromMinute) と終了
 * マーカー (= fromMinute + spanMinutes) は秒まで含む端数位置なので、両端は端数ぶんの細い帯として残し、
 * 内側だけ整数分でくぎる。これで扇の外周は端数まで滑らかに縮みつつ、色のくぎり目は盤面の分目盛と一致する。
 * 各帯の色は終了マーカーからの距離 (分) を GRADIENT_SPAN_MINUTES で正規化して濃→薄を補間して決めるので、
 * 帯のくぎりが盤の分目盛で固定され、針が進んでも色がチラつかない。
 */

/** 薄→濃を張る基準スパン (分)。60 分選択でこの全域を使い、20 分など短い選択では濃い側だけが見える
 *  (短いとグラデーションに見えにくいが仕様どおり)。 */
const GRADIENT_SPAN_MINUTES = 60;

/** 隣接する帯の継ぎ目に出るヘアライン (不透明塗りの境界の anti-alias) を消すための重ね角 (度)。
 *  各帯を現在針側へわずかに伸ばし、次に描く帯がその継ぎ目を覆う。 */
const SEAM_OVERLAP_DEG = 0.6;

interface TimerWedgeProps {
  /** 現在針の位置 (分, 0..60 小数)。扇の始端。 */
  fromMinute: number;
  /** 残り時間 (分, 0..60 小数)。扇の角度幅 = これ × 6°。0 以下なら描かない。 */
  spanMinutes: number;
}

const TimerWedge: Component<TimerWedgeProps> = (props) => {
  const isSector = () => colorMode() === "sector" && paletteId() !== "monotone";
  // 濃い端 (終了マーカー) は単色時代と同じ色。薄い端はそれをさらに白寄りへ薄めた色。
  const nearColor = () => (isSector() ? "#ffdada" : "#f3c8c8");
  const farColor = () => (isSector() ? "#fff4f4" : "#fbeaea");

  const bands = createMemo(() => {
    const span = props.spanMinutes;
    if (span <= 0) return [] as { d: string; fill: string }[];
    const start = props.fromMinute;
    const end = start + span;
    const startAngle = start * 6 - 90;

    // 帯の境界 (分): 現在針 → 次の分目盛 → … → 整数分 … → 終了マーカー。両端は端数で、内側は整数分。
    const edges = [start];
    for (let m = Math.floor(start) + 1; m < end; m++) edges.push(m);
    edges.push(end);

    const near = nearColor();
    const far = farColor();
    const out: { d: string; fill: string }[] = [];
    for (let i = 0; i < edges.length - 1; i++) {
      const from = edges[i]!;
      const to = edges[i + 1]!;
      // 現在針側の境界を継ぎ目ぶん手前へ伸ばす (次に描く帯が継ぎ目を覆う)。扇の実始端 (i===0) と
      // それを越える伸ばしは禁止 = 現在針の縁を動かさない。終了マーカー側 (a2) は常に正確。
      const a1 = Math.max(startAngle, from * 6 - 90 - (i === 0 ? 0 : SEAM_OVERLAP_DEG));
      const a2 = to * 6 - 90;
      const distanceFromMarker = end - (from + to) / 2;
      const t = Math.min(1, distanceFromMarker / GRADIENT_SPAN_MINUTES);
      out.push({
        d: pieSectorPath(CENTER, CENTER, clockRadius(), a1, a2),
        fill: lerpColor(near, far, t),
      });
    }
    return out;
  });

  return (
    <Show when={props.spanMinutes > 0}>
      {/* 現在針側から終了マーカー側へ順に描く = マーカー側 (濃) が上に乗り縁が正確に出る。 */}
      <Index each={bands()}>{(band) => <path d={band().d} fill={band().fill} />}</Index>
    </Show>
  );
};

export default TimerWedge;
