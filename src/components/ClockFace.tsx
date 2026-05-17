import { For, Index, Show, createEffect, createMemo, on, onCleanup } from "solid-js";
import type { Component } from "solid-js";
import { colorMode } from "../features/settings/color-mode";
import { detailMode } from "../features/settings/detail-mode";
import { displayedFormatAt } from "../features/settings/time-format-animation";
import { paletteId } from "../features/settings/palette";
import { getPalette, type HourColor } from "../colors";
import { animateMotion } from "../lib/motion";
import { prerollKey, PULSE_MS } from "../features/settings/time-format-preroll";
import { useI18n } from "../i18n";
import TimeFormatPrerollFx from "./TimeFormatPrerollFx";

/** 12h ⇄ 24h トグル時の 1 ポジションあたりのバウンス。各ポジションが時計回りに stagger 50ms 遅れで
 *  個別に発火するので、全体としては「ポポポポポッ」と右回りに伝播する。 */
const NUMBER_BOUNCE_DURATION_MS = 280;
const NUMBER_BOUNCE_KEYFRAMES: Keyframe[] = [
  { transform: "scale(1)",    offset: 0 },
  { transform: "scale(1.35)", offset: 0.30 },
  { transform: "scale(0.88)", offset: 0.60 },
  { transform: "scale(1.08)", offset: 0.82 },
  { transform: "scale(1)",    offset: 1 },
];

/** ネオン管調の電撃グリーン (12 ドゥンドゥドゥンッ用)。点灯中に hue を微 shift して humming 感を出す。 */
const NEON_ON = "#00FF80";
const NEON_HUM = "#00FFAA";

/** 12 ドゥンドゥドゥンッ × 2 の text fill キーフレーム。originalFill ⇄ ネオン緑で点滅。 */
const buildPulseFillKeyframes = (originalFill: string): Keyframe[] => [
  { fill: originalFill, offset: 0 },
  { fill: NEON_ON,      offset: 0.04 },
  { fill: NEON_HUM,     offset: 0.22 },
  { fill: NEON_ON,      offset: 0.42 },
  { fill: originalFill, offset: 0.50 },
  { fill: originalFill, offset: 0.55 },
  { fill: NEON_ON,      offset: 0.59 },
  { fill: NEON_HUM,     offset: 0.77 },
  { fill: NEON_ON,      offset: 0.96 },
  { fill: originalFill, offset: 1 },
];

/** 12 ドゥンドゥドゥンッ × 2 の group scale キーフレーム。各サイクルは
 *  ドゥン → ドゥ → ドゥンッ → settle → hold → snap の波形を 2 回繰り返す (offset 0.5 で折返し)。 */
const PULSE_SCALE_KEYFRAMES: Keyframe[] = [
  { transform: "scale(1)",    offset: 0 },
  { transform: "scale(1.30)", offset: 0.07 },
  { transform: "scale(1.18)", offset: 0.14 },
  { transform: "scale(1.45)", offset: 0.22 },
  { transform: "scale(1.32)", offset: 0.32 },
  { transform: "scale(1.30)", offset: 0.42 },
  { transform: "scale(1)",    offset: 0.50 },
  { transform: "scale(1)",    offset: 0.55 },
  { transform: "scale(1.30)", offset: 0.62 },
  { transform: "scale(1.18)", offset: 0.69 },
  { transform: "scale(1.45)", offset: 0.77 },
  { transform: "scale(1.32)", offset: 0.86 },
  { transform: "scale(1.30)", offset: 0.96 },
  { transform: "scale(1)",    offset: 1 },
];

/** 時間の数字 font-size。ばっじ×すっきり×ものとーんだけバッジの円が白で消えるので数字を少し大きく。
 *  ばっじモードでも すっきり/くわしく で差別化 (くぎりモードと同じ流儀)。
 *  monotone × badge × cardinal (12/3/6/9 と PM 24h の 12/15/18/21) は「文字盤自体がバッジ化」する
 *  特別仕様で、くぎりモードと同じ font-size に揃える。non-cardinal は invisible 想定で従来サイズ。
 *  monotone × sector は font を +1、白フチ stroke-width を -2 して白盤面に対する黒インクの
 *  存在感を強める (視覚総幅は -1 まで許容)。 */
const numberFontSize = (
  colorModeValue: "sector" | "badge",
  paletteIdValue: string,
  kuwashiku: boolean,
  num: number,
  isCardinal: boolean,
): string => {
  if (colorModeValue === "badge" && paletteIdValue === "monotone" && isCardinal) {
    if (kuwashiku) return num >= 10 ? "30" : "34";
    return num >= 10 ? "38" : "42";
  }
  if (colorModeValue === "badge") {
    if (paletteIdValue === "monotone" && !kuwashiku) return num >= 10 ? "24" : "30";
    if (!kuwashiku) return num >= 10 ? "22" : "28";
    return num >= 10 ? "18" : "24";
  }
  if (paletteIdValue === "monotone") {
    if (kuwashiku) return num >= 10 ? "25" : "29";
    return num >= 10 ? "33" : "37";
  }
  if (kuwashiku) return num >= 10 ? "24" : "28";
  return num >= 10 ? "32" : "36";
};

/** monotone × badge の cardinal 数字 (12/3/6/9 と PM 24h の 12/15/18/21) のポジション。
 *  position 0/3/6/9 はそのまま AM/12h は 12/3/6/9、PM 24h は 12/15/18/21 に対応。 */
const isCardinalPosition = (position: number): boolean =>
  position === 0 || position === 3 || position === 6 || position === 9;

/** ばっじ円の半径。すっきりで一回り大きく (数字 font-size と一緒にスケールさせる)。 */
const BADGE_R_KUWASHIKU = 18;
const BADGE_R_SUKKIRI = 21;

/** 値が変わった瞬間にバウンスさせる effect。実質 PM 盤面のみ発火 (AM/merged は num 不変で no-op)。
 *  連打時に前のバウンスが残らないよう cancel してから start する。
 *  unmount 時にも明示 cancel して、Animation オブジェクトが element ref を retain して detached
 *  node が残るのを防ぐ。 */
const setupNumberBounce = (
  groupRefGetter: () => SVGGElement | undefined,
  num: () => number,
) => {
  let anim: Animation | null = null;
  createEffect(on(num, () => {
    const g = groupRefGetter();
    if (!g) return;
    anim?.cancel();
    anim = animateMotion(g, NUMBER_BOUNCE_KEYFRAMES, {
      duration: NUMBER_BOUNCE_DURATION_MS,
      easing: "ease-out",
    });
  }, { defer: true }));
  onCleanup(() => anim?.cancel());
};

/** PM の position 0 (てっぺんの 12) のみ発動する「12 ドゥンドゥドゥンッ × 2」effect。num 不変で
 *  setupNumberBounce が走らないので、代わりに 2 サイクル分弾ませて「12 を足す」操作の主役を示す。
 *  text fill をネオン緑に点滅、group scale を波形で弾ませる (互いに transform 取り合いは起きない)。
 *  unmount 時にも明示 cancel して Animation の element retention を断つ。 */
const setupTwelveDun = (
  period: () => "am" | "pm" | "merged",
  position: number,
  groupRefGetter: () => SVGGElement | undefined,
  textRefGetter: () => SVGTextElement | undefined,
) => {
  let pulseAnim: Animation | null = null;
  let pulseScaleAnim: Animation | null = null;
  createEffect(on(prerollKey, () => {
    if (position !== 0 || period() !== "pm") return;
    const t = textRefGetter();
    const g = groupRefGetter();
    if (!t || !g) return;
    pulseAnim?.cancel();
    pulseScaleAnim?.cancel();
    const originalFill = t.getAttribute("fill") || "#111111";
    pulseAnim = animateMotion(t, buildPulseFillKeyframes(originalFill), {
      duration: PULSE_MS * 2,
      easing: "ease-in-out",
    });
    pulseScaleAnim = animateMotion(g, PULSE_SCALE_KEYFRAMES, {
      duration: PULSE_MS * 2,
      easing: "ease-in-out",
    });
  }, { defer: true }));
  onCleanup(() => {
    pulseAnim?.cancel();
    pulseScaleAnim?.cancel();
  });
};

interface ClockFaceProps {
  period: "am" | "pm" | "merged";
  /** vivid パレット時の AM/PM 配色判別用 (merged 時のみ参照)。 */
  hours: number;
}

function hourToAngle(hour: number): number {
  return (hour / 12) * 360 - 90;
}

function annularSectorPath(
  cx: number, cy: number,
  innerR: number, outerR: number,
  startAngleDeg: number, endAngleDeg: number,
): string {
  const s = (startAngleDeg * Math.PI) / 180;
  const e = (endAngleDeg * Math.PI) / 180;
  const ox1 = cx + outerR * Math.cos(s);
  const oy1 = cy + outerR * Math.sin(s);
  const ox2 = cx + outerR * Math.cos(e);
  const oy2 = cy + outerR * Math.sin(e);
  const ix1 = cx + innerR * Math.cos(e);
  const iy1 = cy + innerR * Math.sin(e);
  const ix2 = cx + innerR * Math.cos(s);
  const iy2 = cy + innerR * Math.sin(s);
  const la = endAngleDeg - startAngleDeg > 180 ? 1 : 0;
  return [
    `M ${ox1} ${oy1}`,
    `A ${outerR} ${outerR} 0 ${la} 1 ${ox2} ${oy2}`,
    `L ${ix1} ${iy1}`,
    `A ${innerR} ${innerR} 0 ${la} 0 ${ix2} ${iy2}`,
    "Z",
  ].join(" ");
}

const ClockFace: Component<ClockFaceProps> = (props) => {
  const { t, formatNumeral } = useI18n();
  const isKuwashiku = () => detailMode() === "kuwashiku";
  /** monotone × badge は「文字盤自体がバッジ化」する特別仕様。個別 badge 円を出さず、cardinal 数字のみ
   *  くぎりモード流儀の大きなサイズで描き、円盤縁に 59 個の分メモリを置く。 */
  const isMonotoneBadge = () => colorMode() === "badge" && paletteId() === "monotone";

  const VIEW = 340;
  const CX = VIEW / 2;
  const CY = VIEW / 2;
  /** くわしくは時計を縮めて外に分数字スペースを確保、すっきりは画面いっぱい。 */
  const R = () => isKuwashiku() ? 130 : 148;
  /** ばっじ×すっきりは badge 半径が 22 に膨らむので、外周はみ出し回避で内側へ 4 引き込む。
   *  monotone × badge は「文字盤自体がバッジ化」する特別仕様なので、cardinal 数字を縁から
   *  さらに内側に寄せて中央に呼吸を作る (個別 badge 円を出さない分の視覚密度を確保)。 */
  const NUM_R = () => {
    if (isMonotoneBadge()) return R() - 34;
    return R() - (colorMode() === "badge" && !isKuwashiku() ? BADGE_R_SUKKIRI : 18);
  };
  const BAND_INNER = () => NUM_R() - 16;
  const BAND_OUTER = () => R();
  const OUTER_RING = () => R() + 3;
  const MINUTE_NUM_R = () => R() + 20;

  /** period × palette から 12 個の時間色を引く。merged 時、vivid は時刻で AM/PM 切替、それ以外は am 流用
   *  (vivid 以外は AM=PM の同色なので)。 */
  const colors = createMemo((): HourColor[] => {
    const palette = getPalette(paletteId());
    if (props.period === "am") return palette.am;
    if (props.period === "pm") return palette.pm;
    if (palette.id !== "vivid") return palette.am;
    return props.hours < 12 ? palette.am : palette.pm;
  });

  /** ポジション (0..11) における表示数値。
   *  - position 0 (12 時) は常に 12
   *  - AM / merged は 1..11 固定
   *  - PM は displayedFormatAt(position) に応じて 1..11 / 13..23 (各ポジション独立 reactive で
   *    ポジションごとに時間差で format を更新 → 時計回りの stagger になる)。 */
  const numberAt = (position: number): number => {
    if (position === 0) return 12;
    if (props.period === "am" || props.period === "merged") return position;
    return displayedFormatAt(position) === "24h" ? position + 12 : position;
  };

  const POSITIONS = Array.from({ length: 12 }, (_, i) => i);

  return (
    <div class="w-full h-full flex items-center justify-center">
      {/* role="img" + aria-label で SVG をひとつの画像として扱わせる。なしだと Googlebot や
          screen reader が中の <text> (1〜12, 1〜60) を本文として拾い、検索スニペットが
          「1 2 3 4 5 ...」になる事故が起きる。 */}
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
        {/* 外側リング (SVG filter は重いのでシンプルな同心円 2 枚で縁取り) */}
        <circle
          cx={CX} cy={CY} r={OUTER_RING() + 2}
          fill={props.period === "merged" ? "#1a1a1a" : props.period === "pm" ? "#C01850" : "#0060B0"}
        />
        <circle
          cx={CX} cy={CY} r={OUTER_RING()}
          fill={props.period === "merged" ? "#3a3a3a" : props.period === "pm" ? "#E02068" : "#0080D8"}
        />

        {/* 文字盤 (ものとーん時だけ真っ白で区切り線と同化させる) */}
        <circle
          cx={CX} cy={CY} r={R()}
          fill={
            paletteId() === "monotone"
              ? "#ffffff"
              : props.period === "merged" ? "#ececec" : props.period === "pm" ? "#f8d8e0" : "#d8e8f8"
          }
        />

        <Show when={colorMode() === "sector"}>
          <For each={colors()}>
            {(color, i) => (
              <path
                d={annularSectorPath(
                  CX, CY,
                  BAND_INNER(), BAND_OUTER(),
                  hourToAngle(i()),
                  hourToAngle(i() + 1),
                )}
                fill={color.bg}
                opacity={0.8}
                stroke="#ffffff"
                stroke-width="2"
              />
            )}
          </For>
          {/* 12, 3, 6, 9 の境界線を太く */}
          <For each={[0, 3, 6, 9]}>
            {(h) => {
              const angle = () => (h * 30 * Math.PI) / 180 - Math.PI / 2;
              return (
                <line
                  x1={CX + BAND_INNER() * Math.cos(angle())}
                  y1={CY + BAND_INNER() * Math.sin(angle())}
                  x2={CX + (BAND_OUTER() - 1) * Math.cos(angle())}
                  y2={CY + (BAND_OUTER() - 1) * Math.sin(angle())}
                  stroke="#ffffff"
                  stroke-width="4"
                  stroke-linecap="round"
                />
              );
            }}
          </For>
        </Show>

        <Show when={colorMode() === "badge"}>
          <circle cx={CX} cy={CY} r={R()} fill="#ffffff" />
        </Show>

        {/* くぎりモードの分メモリ。monotone-badge では円盤縁の専用メモリを別途描くので抑止。 */}
        <Show when={isKuwashiku() && !isMonotoneBadge()}>
          <For each={Array.from({ length: 60 })}>
            {(_, i) => {
              const angle = () => (i() * 6 * Math.PI) / 180 - Math.PI / 2;
              const isHour = () => i() % 5 === 0;
              const outer = () => OUTER_RING();
              const inner = () => isHour() ? R() - 8 : R() - 3;
              return (
                <line
                  x1={CX + inner() * Math.cos(angle())}
                  y1={CY + inner() * Math.sin(angle())}
                  x2={CX + outer() * Math.cos(angle())}
                  y2={CY + outer() * Math.sin(angle())}
                  stroke={isHour() ? "#ffffff" : "#ffffff90"}
                  stroke-width={isHour() ? 2.5 : 1}
                  stroke-linecap="round"
                />
              );
            }}
          </For>
        </Show>

        {/* monotone × badge 専用の円盤縁メモリ。i=0..59 の 60 本 (12 の真上にも置く)。
         *  外端を OUTER_RING (R+3) まで延伸して外側リングに沿わせ、外側 cap は flat (butt)。
         *  内端は元位置 (major R-12 / minor R-5) で、stroke 半径ぶんの円を重ねて丸める
         *  (SVG line は 2 端で異なる linecap を持てないので、line+circle で内側だけ丸を実装)。 */}
        <Show when={isMonotoneBadge()}>
          <For each={Array.from({ length: 60 })}>
            {(_, idx) => {
              const i = () => idx();
              const angle = () => (i() * 6 * Math.PI) / 180 - Math.PI / 2;
              const isMajor = () => i() % 5 === 0;
              const outer = () => R();
              const inner = () => isMajor() ? R() - 12 : R() - 5;
              const sw = () => isMajor() ? 3 : 1.8;
              const ix = () => CX + inner() * Math.cos(angle());
              const iy = () => CY + inner() * Math.sin(angle());
              return (
                <g>
                  <line
                    x1={ix()} y1={iy()}
                    x2={CX + outer() * Math.cos(angle())}
                    y2={CY + outer() * Math.sin(angle())}
                    stroke="#1a1a1a"
                    stroke-width={sw()}
                    stroke-linecap="butt"
                  />
                  <circle cx={ix()} cy={iy()} r={sw() / 2} fill="#1a1a1a" />
                </g>
              );
            }}
          </For>
        </Show>

        <Show when={isKuwashiku()}>
          <For each={Array.from({ length: 60 })}>
            {(_, i) => {
              const min = () => i() + 1;
              const angle = () => (min() * 6 * Math.PI) / 180 - Math.PI / 2;
              const x = () => CX + MINUTE_NUM_R() * Math.cos(angle());
              const y = () => CY + MINUTE_NUM_R() * Math.sin(angle());
              const is5 = () => min() % 5 === 0;
              return (
                <text
                  x={x()}
                  y={y()}
                  text-anchor="middle"
                  dominant-baseline="central"
                  font-size={is5() ? "11" : "8"}
                  font-weight={is5() ? "900" : "700"}
                  font-family="Futatoki Bengali Digits, Nunito, sans-serif"
                  fill={is5() ? "#444444" : "#666666"}
                >
                  {formatNumeral(min())}
                </text>
              );
            }}
          </For>
        </Show>

        {/* 時間の数字。<Index> でポジション固定の DOM を維持し、値変化 (12h ⇄ 24h) のみで <g> を
            バウンスさせる。<For> だと値変化で DOM 入れ替えが起きてアニメ対象が消えるため Index 必須。 */}
        <Index each={POSITIONS}>
          {(_pos, position) => {
            const angle = () => (position * 30 * Math.PI) / 180 - Math.PI / 2;
            const color = () => colors()[position];
            const num = createMemo(() => numberAt(position));
            /** monotone × badge の横サイド (position 3/9) は表示数字幅に応じて radial 補正する:
             *  - 単桁 "3"/"9" は半幅が狭く tick まで間延びして見えるので +4 外寄せ
             *  - 2 桁 "15"/"21" は半幅が広く tick にぶつかりがちなので -4 内寄せ
             *  12/6/18 は上下なので縦方向の余白で十分、shift 不要。 */
            const radialNudge = () => {
              if (!isMonotoneBadge()) return 0;
              const n = num();
              if (n === 3 || n === 9) return 4;
              if (n === 15 || n === 21) return -4;
              return 0;
            };
            const effectiveR = () => NUM_R() + radialNudge();
            const x = () => CX + effectiveR() * Math.cos(angle());
            const y = () => CY + effectiveR() * Math.sin(angle());

            let groupRef: SVGGElement | undefined;
            let textRef: SVGTextElement | undefined;

            setupNumberBounce(() => groupRef, num);
            setupTwelveDun(() => props.period, position, () => groupRef, () => textRef);

            const isCardinal = isCardinalPosition(position);

            return (
              <g
                ref={groupRef}
                style={{
                  "transform-box": "fill-box",
                  "transform-origin": "center",
                }}
              >
                {/* 個別 badge 円。monotone-badge は「文字盤自体がバッジ化」なので個別円を描かない。 */}
                <Show when={colorMode() === "badge" && !isMonotoneBadge()}>
                  <circle cx={x()} cy={y()} r={isKuwashiku() ? BADGE_R_KUWASHIKU : BADGE_R_SUKKIRI} fill={color()!.badge} />
                </Show>
                <text
                  ref={textRef}
                  x={x()}
                  y={y()}
                  text-anchor="middle"
                  dominant-baseline="central"
                  font-size={numberFontSize(colorMode(), paletteId(), isKuwashiku(), num(), isCardinal)}
                  font-weight="900"
                  font-family="Futatoki Bengali Digits, Nunito, sans-serif"
                  fill={
                    isMonotoneBadge()
                      ? (isCardinal ? "#111111" : "#ffffff")
                      : (colorMode() === "badge" ? color()!.text : "#111111")
                  }
                  stroke={colorMode() === "sector" ? "#ffffff" : "none"}
                  stroke-width={
                    colorMode() === "sector"
                      ? (paletteId() === "monotone"
                          ? (isKuwashiku() ? "2" : "3")
                          : (isKuwashiku() ? "4" : "5"))
                      : "0"
                  }
                  paint-order="stroke"
                >
                  {formatNumeral(num())}
                </text>
              </g>
            );
          }}
        </Index>

        {/* 12h ⇄ 24h preroll の衝撃波リング (色変化は上の text の pulseAnim 側で担当)。数字が変わる
            PM 盤面でのみ意味があるので Show でマウント。 */}
        <Show when={props.period === "pm"}>
          <TimeFormatPrerollFx centerX={CX} centerY={CY - NUM_R()} />
        </Show>
      </svg>
    </div>
  );
};

export default ClockFace;
