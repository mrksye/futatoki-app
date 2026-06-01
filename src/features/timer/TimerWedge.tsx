import { Index, Show, createMemo, type Component } from "solid-js";
import { colorMode } from "../settings/color-mode";
import { paletteId } from "../settings/palette";
import { CENTER, clockRadius, pieSectorPath } from "../../components/clockface-layers/geometry";
import { lerpColor } from "../../lib/color";

/**
 * タイマー扇レイヤー。timer 盤の中心から盤面縁までを淡赤の扇 (pie) で塗る。ClockFace の children として
 * BaseFace と FaceDetail の間に差し込まれ、背景色の上・色扇/バッジ/数字の下に乗る (数字は扇の上で読める)。
 * 開始点〜終了マーカーの全域を 2 本の扇で塗り分ける想定で、本コンポーネントは扇 1 本ぶん:
 *  - 残り (現在針 → 終了マーカー): showTicks=true で 1 分ごとの目盛線を乗せ「あと何分」を数えられる扇に。
 *  - 到達済み (開始点 → 現在針): showTicks=false の素のグラデ扇 (今まで通りの見た目)。
 * 2 本は gradientEndMinute を共有 (= 終了マーカー位置) することで濃→薄が継ぎ目なくつながり、1 枚の扇に
 * 残りぶんだけ目盛が入ったように見える。中断 (一時停止) の積算を示すうっすい青は、際限なく積み上がり得るため
 * バンド分割しない単一 pie の別レイヤー (TimerInterruptionArc) が担う。
 *
 * 色: 終了マーカー (終了点) を一番濃く、そこから離れるほど薄くしたグラデーション。濃い端は盤面の背景で
 * 見え方が変わるので 2 段に出し分ける。非ものとーんのくぎり (盤面に opacity 0.8 の色扇が乗る) では、その
 * 色扇を明るく抜くために明るめの淡赤 #ffdada。ばっじ / ものとーん (盤面が白) では白に溶けないよう少し濃いめの
 * 淡赤 #f3c8c8。薄い端はそれぞれをさらに白寄りへ薄めた色。
 *
 * 帯の割り方: 色のくぎりは時計盤の 1 分目盛 (絶対角度 = 分 × 6°) にそろえる。扇の両端 (fromMinute と
 * fromMinute + spanMinutes) は秒まで含む端数位置なので両端は端数ぶんの細い帯として残し、内側だけ整数分で
 * くぎる。これで扇の外周は端数まで滑らかに動きつつ、色のくぎり目は盤面の分目盛と一致する。各帯の色は
 * gradientEndMinute からの距離 (分) を GRADIENT_SPAN_MINUTES で正規化して濃→薄を補間して決めるので、帯の
 * くぎりが盤の分目盛で固定され、針が進んでも色がチラつかない。
 *
 * 目盛線 (showTicks): 整数分のくぎり (中心から縁への放射線) を引いて 1 分ずつ数えられる扇にする。線は帯の
 * 塗りの上・数字の下に乗る (数字の可読性は保つ)。残り扇に付けると、現在針が進んで整数分を越えるたびにその線が
 * 残り扇から外れて消える = 到達済みの分は線なしのグラデ扇に戻る。扇の両端 (始端 = 現在針の端数位置 / 終端 =
 * 終了マーカーの端数位置) は目盛ではなく扇の縁なので線を出さない (現在針の先端や「あと 30 秒」の終わり際に
 * 半端な線が刺さるのを避ける)。
 */

/** 薄→濃を張る基準スパン (分)。60 分選択でこの全域を使い、20 分など短い選択では濃い側だけが見える
 *  (短いとグラデーションに見えにくいが仕様どおり)。 */
const GRADIENT_SPAN_MINUTES = 60;

/** 隣接する帯の継ぎ目に出るヘアライン (不透明塗りの境界の anti-alias) を消すための重ね角 (度)。
 *  各帯を始端側へわずかに伸ばし、次に描く帯がその継ぎ目を覆う。 */
const SEAM_OVERLAP_DEG = 0.6;

/** 目盛線の太さ (viewBox 340 基準)。針より細い細線で、扇を分割しすぎず数えられる程度に控えめ。 */
const TICK_LINE_WIDTH = 0.5;

/** 目盛線の色。淡赤の扇のくぎりを白で抜く。 */
const TICK_LINE_COLOR = "#ffffff";

/** 目盛線の不透明度。完全な白だと線が刺さりすぎるので、塗りに馴染む半透明の白にする。 */
const TICK_LINE_OPACITY = 0.72;

interface TimerWedgeProps {
  /** 扇の始端 (分, 0..60 小数)。残りなら現在針、到達済みなら開始点。 */
  fromMinute: number;
  /** 扇の角度幅のもとになる分幅 (0..60 小数)。幅 = これ × 6°。0 以下なら描かない。 */
  spanMinutes: number;
  /** 1 分ごとの目盛線 (放射線) を乗せるか。残り扇のみ true。 */
  showTicks?: boolean;
  /** 濃いめの淡赤ペアを使うか。残り扇 (目盛つき) を到達済み扇よりひとまわり濃くして差をつける用。
   *  near/far 両方を少し濃くするので、扇の始点 (現在針側) も終点 (終了マーカー側) も一段濃くなる。 */
  deeper?: boolean;
  /** グラデの一番濃い端の分位置 (絶対分, 連続値で 60 超も可)。残り・到達済みの 2 本でこれを共有すると
   *  濃→薄が継ぎ目なくつながる。省略時は自分の終端 (fromMinute + spanMinutes)。 */
  gradientEndMinute?: number;
}

/** 分位置 (小数可) を盤面縁の座標へ。絶対角度 = 分 × 6° − 90° (12 時を上に)。 */
function rimPoint(minute: number): { x: number; y: number } {
  const angle = ((minute * 6 - 90) * Math.PI) / 180;
  const radius = clockRadius();
  return { x: CENTER + radius * Math.cos(angle), y: CENTER + radius * Math.sin(angle) };
}

const TimerWedge: Component<TimerWedgeProps> = (props) => {
  const isSector = () => colorMode() === "sector" && paletteId() !== "monotone";
  // 濃い端 (終了マーカー) は単色時代と同じ色。薄い端はそれをさらに白寄りへ薄めた色。deeper はその両端を
  // ひとまわり濃くした残り扇用ペア (到達済み扇と差をつける)。
  const nearColor = () => {
    if (isSector()) return props.deeper ? "#ffd2d2" : "#ffdada";
    return props.deeper ? "#f1c0c0" : "#f3c8c8";
  };
  const farColor = () => {
    if (isSector()) return props.deeper ? "#ffeded" : "#fff4f4";
    return props.deeper ? "#f9e3e3" : "#fbeaea";
  };

  /** 帯 (扇の塗り) と目盛線 (各くぎりの放射線) を 1 つの edges 計算から同時に作る。 */
  const wedge = createMemo(() => {
    const span = props.spanMinutes;
    const empty = { bands: [] as { d: string; fill: string }[], ticks: [] as { x: number; y: number }[] };
    if (span <= 0) return empty;
    const start = props.fromMinute;
    const end = start + span;
    const startAngle = start * 6 - 90;
    // グラデの濃い端 = 終了マーカー。2 本の扇で共有して継ぎ目のない 1 枚に見せる (省略時は自分の終端)。
    const gradientEnd = props.gradientEndMinute ?? end;

    // 帯の境界 (分): 始端 → 次の分目盛 → … → 整数分 … → 終端。両端は端数で、内側は整数分。
    const edges = [start];
    for (let m = Math.floor(start) + 1; m < end; m++) edges.push(m);
    edges.push(end);

    const near = nearColor();
    const far = farColor();
    const bands: { d: string; fill: string }[] = [];
    for (let i = 0; i < edges.length - 1; i++) {
      const from = edges[i]!;
      const to = edges[i + 1]!;
      // 始端側の境界を継ぎ目ぶん手前へ伸ばす (次に描く帯が継ぎ目を覆う)。扇の実始端 (i===0) と
      // それを越える伸ばしは禁止 = 始端の縁を動かさない。終端側 (a2) は常に正確。
      const a1 = Math.max(startAngle, from * 6 - 90 - (i === 0 ? 0 : SEAM_OVERLAP_DEG));
      const a2 = to * 6 - 90;
      const distanceFromMarker = gradientEnd - (from + to) / 2;
      const t = Math.min(1, distanceFromMarker / GRADIENT_SPAN_MINUTES);
      bands.push({
        d: pieSectorPath(CENTER, CENTER, clockRadius(), a1, a2),
        fill: lerpColor(near, far, t),
      });
    }

    // 整数分のくぎりにだけ放射線 (残り扇のみ)。両端 (始端 = 現在針の端数位置 / 終端 = 終了マーカーの
    // 端数位置) は除外する = それ自体は目盛ではなく扇の縁なので、線を出すと現在針の先端や「あと 30 秒」の
    // 終わり際に半端な線が刺さってしまう。線はすべて中心始点なので縁側の端点だけ持てばよい。
    const ticks = props.showTicks ? edges.slice(1, -1).map(rimPoint) : [];
    return { bands, ticks };
  });

  return (
    <Show when={props.spanMinutes > 0}>
      {/* 始端側から終端側へ順に描く = 終端側 (濃) が上に乗り縁が正確に出る。 */}
      <Index each={wedge().bands}>{(band) => <path d={band().d} fill={band().fill} />}</Index>
      {/* 目盛線は帯の塗りの上に乗せる (くぎりが塗りで埋もれないように)。 */}
      <Index each={wedge().ticks}>
        {(tick) => (
          <line
            x1={CENTER}
            y1={CENTER}
            x2={tick().x}
            y2={tick().y}
            stroke={TICK_LINE_COLOR}
            stroke-width={TICK_LINE_WIDTH}
            stroke-opacity={TICK_LINE_OPACITY}
          />
        )}
      </Index>
    </Show>
  );
};

export default TimerWedge;
