import { Index, Show, createMemo, type Component } from "solid-js";
import { colorMode } from "../settings/color-mode";
import { paletteId } from "../settings/palette";
import { CENTER, clockRadius, pieSectorPath } from "../../components/clockface-layers/geometry";
import { lerpColor } from "../../lib/color";

/**
 * 残りタイマーの扇レイヤー。timer 盤の中心から盤面縁までを淡赤の扇 (pie) で塗る。ClockFace の children
 * として BaseFace と FaceDetail の間に差し込まれ、背景色の上・色扇/バッジ/数字の下に乗る (数字は扇の上で
 * 読める)。現在針から終了マーカーまでの「あと何分」を塗る。到達済み・中断は塗らず開始点に線で示す
 * (TimerStartLine) ので、本コンポーネントは残りの 1 本だけを担う。
 *
 * 色: 終了マーカー (終了点) を一番濃く、そこから離れるほど薄くしたグラデーション。濃い端は盤面の背景で
 * 見え方が変わるので 2 段に出し分ける。非ものとーんのくぎり (盤面に opacity 0.8 の色扇が乗る) では、その
 * 色扇を明るく抜くために明るめの淡赤 #ffd2d2。ばっじ / ものとーん (盤面が白) では白に溶けないよう少し
 * 濃いめの淡赤 #f1c0c0。薄い端はそれぞれをさらに白寄りへ薄めた色。
 *
 * 帯の割り方: 色のくぎりは時計盤の 1 分目盛 (絶対角度 = 分 × 6°) にそろえる。扇の両端 (fromMinute と
 * fromMinute + spanMinutes) は秒まで含む端数位置なので両端は端数ぶんの細い帯として残し、内側だけ整数分で
 * くぎる。これで扇の外周は端数まで滑らかに動きつつ、各帯の色は終了マーカーからの距離で決まるので、帯の
 * くぎりが盤の分目盛で固定され針が進んでも色がチラつかない。
 */

/** 薄→濃を張る基準スパン (分)。60 分選択でこの全域を使い、20 分など短い選択では濃い側だけが見える
 *  (短いとグラデーションに見えにくいが仕様どおり)。 */
const GRADIENT_SPAN_MINUTES = 60;

/** 隣接する帯の継ぎ目に出るヘアライン (不透明塗りの境界の anti-alias) を消すための重ね角 (度)。
 *  各帯を始端側へわずかに伸ばし、次に描く帯がその継ぎ目を覆う。 */
const SEAM_OVERLAP_DEG = 0.6;

interface TimerWedgeProps {
  /** 扇の始端 (分, 0..60 小数) = 現在針。 */
  fromMinute: number;
  /** 扇の角度幅のもとになる分幅 (0..60 小数)。幅 = これ × 6°。0 以下なら描かない。 */
  spanMinutes: number;
}

const TimerWedge: Component<TimerWedgeProps> = (props) => {
  const isSector = () => colorMode() === "sector" && paletteId() !== "monotone";
  // 濃い端 (終了マーカー)。薄い端はそれをさらに白寄りへ薄めた色。
  const nearColor = () => (isSector() ? "#ffd2d2" : "#f1c0c0");
  const farColor = () => (isSector() ? "#ffeded" : "#f9e3e3");

  const bands = createMemo(() => {
    const span = props.spanMinutes;
    if (span <= 0) return [] as { d: string; fill: string }[];
    const start = props.fromMinute;
    const end = start + span;
    const startAngle = start * 6 - 90;
    // グラデの濃い端 = 終了マーカー = 扇の終端。
    const gradientEnd = end;

    // 帯の境界 (分): 始端 → 次の分目盛 → … → 整数分 … → 終端。両端は端数で、内側は整数分。
    const edges = [start];
    for (let m = Math.floor(start) + 1; m < end; m++) edges.push(m);
    edges.push(end);

    const near = nearColor();
    const far = farColor();
    const result: { d: string; fill: string }[] = [];
    for (let i = 0; i < edges.length - 1; i++) {
      const from = edges[i]!;
      const to = edges[i + 1]!;
      // 始端側の境界を継ぎ目ぶん手前へ伸ばす (次に描く帯が継ぎ目を覆う)。扇の実始端 (i===0) と
      // それを越える伸ばしは禁止 = 始端の縁を動かさない。終端側 (a2) は常に正確。
      const a1 = Math.max(startAngle, from * 6 - 90 - (i === 0 ? 0 : SEAM_OVERLAP_DEG));
      const a2 = to * 6 - 90;
      const distanceFromMarker = gradientEnd - (from + to) / 2;
      const t = Math.min(1, distanceFromMarker / GRADIENT_SPAN_MINUTES);
      result.push({
        d: pieSectorPath(CENTER, CENTER, clockRadius(), a1, a2),
        fill: lerpColor(near, far, t),
      });
    }
    return result;
  });

  return (
    <Show when={props.spanMinutes > 0}>
      {/* 始端側から終端側へ順に描く = 終端側 (濃) が上に乗り縁が正確に出る。 */}
      <Index each={bands()}>{(band) => <path d={band().d} fill={band().fill} />}</Index>
    </Show>
  );
};

export default TimerWedge;
