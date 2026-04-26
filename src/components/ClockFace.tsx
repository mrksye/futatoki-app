import { For, Index, Show, createEffect, createMemo, on } from "solid-js";
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

/** 12h ⇄ 24h トグル時の 1 ポジションあたりのバウンス。
 *  各ポジションが時計回りに stagger 50ms 遅れで個別に発火するので、
 *  全体としては「ポポポポポッ」と右回りに伝播する。 */
const NUMBER_BOUNCE_DURATION_MS = 280;
const NUMBER_BOUNCE_KEYFRAMES: Keyframe[] = [
  { transform: "scale(1)",    offset: 0 },
  { transform: "scale(1.35)", offset: 0.30 },
  { transform: "scale(0.88)", offset: 0.60 },
  { transform: "scale(1.08)", offset: 0.82 },
  { transform: "scale(1)",    offset: 1 },
];

interface ClockFaceProps {
  period: "am" | "pm" | "merged";
  /** vivid パレット時の AM/PM 配色判別用 (merged 時のみ参照) */
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
  const { t } = useI18n();
  const isKuwashiku = () => detailMode() === "kuwashiku";

  // くわしく: 時計を縮めて外に分数字スペースを確保
  // すっきり: 時計が画面いっぱい
  const VIEW = 340;
  const CX = VIEW / 2;
  const CY = VIEW / 2;
  const R = () => isKuwashiku() ? 130 : 148;
  const NUM_R = () => R() - 18;
  const BAND_INNER = () => NUM_R() - 16;
  const BAND_OUTER = () => R();
  const OUTER_RING = () => R() + 3;
  const MINUTE_NUM_R = () => R() + 20;

  const colors = createMemo((): HourColor[] => {
    const palette = getPalette(paletteId());
    if (props.period === "am") return palette.am;
    if (props.period === "pm") return palette.pm;
    // merged: 他パレットはAM=PMなので am を流用。
    // そらのいろ (vivid) は AM/PM で配色が違うので、表示中の時刻で切り替える。
    if (palette.id !== "vivid") return palette.am;
    return props.hours < 12 ? palette.am : palette.pm;
  });

  /** ポジション (0..11) における表示数値。
   *  - position 0 (12 時の位置) は常に 12。
   *  - AM / merged は 1..11 固定。
   *  - PM は displayedFormatAt(position) に応じて 1..11 / 13..23。
   *    各ポジション独立に reactive。time-format-animation がポジションごとに
   *    時間差で format を更新することで、時計回りの stagger が実現する。 */
  const numberAt = (position: number): number => {
    if (position === 0) return 12;
    if (props.period === "am" || props.period === "merged") return position;
    return displayedFormatAt(position) === "24h" ? position + 12 : position;
  };

  // <Index> 用の固定配列。値は使わず position (= 第 2 引数) だけ使う。
  const POSITIONS = Array.from({ length: 12 }, (_, i) => i);

  return (
    <div class="w-full h-full flex items-center justify-center">
      {/* role="img" + aria-label で SVG をひとつの画像として扱わせる。
          そうしないと Googlebot や screen reader が中の <text> (1〜12,
          1〜60) を本文テキストとして拾ってしまい、検索スニペットが
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
        {/* 外側リング（細め。SVGフィルターは重いのでシンプルな同心円で縁取り） */}
        <circle
          cx={CX} cy={CY} r={OUTER_RING() + 2}
          fill={props.period === "merged" ? "#1a1a1a" : props.period === "pm" ? "#C01850" : "#0060B0"}
        />
        <circle
          cx={CX} cy={CY} r={OUTER_RING()}
          fill={props.period === "merged" ? "#3a3a3a" : props.period === "pm" ? "#E02068" : "#0080D8"}
        />

        {/* 文字盤（ほんのり色付き。ものとーん時だけ真っ白にして区切り線と同化させる） */}
        <circle
          cx={CX} cy={CY} r={R()}
          fill={
            paletteId() === "monotone"
              ? "#ffffff"
              : props.period === "merged" ? "#ececec" : props.period === "pm" ? "#f8d8e0" : "#d8e8f8"
          }
        />

        {/* 扇形モード */}
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
          {/* 12,3,6,9の境界線を太く */}
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

        {/* バッジモードの白背景 */}
        <Show when={colorMode() === "badge"}>
          <circle cx={CX} cy={CY} r={R()} fill="#ffffff" />
        </Show>

        {/* 外周60分目盛り線（くわしくモードのみ） */}
        <Show when={isKuwashiku()}>
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

        {/* くわしくモード: 外周に1-60の分数字（ふわっと存在） */}
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
                  font-family="Nunito, sans-serif"
                  fill={is5() ? "#444444" : "#666666"}
                >
                  {min()}
                </text>
              );
            }}
          </For>
        </Show>

        {/* 時間の数字。<Index> でポジション固定の DOM を維持し、値変化 (12h ⇄ 24h)
            のみで <g> をバウンスさせる。<For> だと値変化で DOM 入れ替えが起きて
            アニメ対象が消えてしまうため Index を使う。 */}
        <Index each={POSITIONS}>
          {(_pos, position) => {
            const angle = () => (position * 30 * Math.PI) / 180 - Math.PI / 2;
            const x = () => CX + NUM_R() * Math.cos(angle());
            const y = () => CY + NUM_R() * Math.sin(angle());
            const color = () => colors()[position];
            const num = createMemo(() => numberAt(position));

            let groupRef: SVGGElement | undefined;
            let textRef: SVGTextElement | undefined;
            let bounceAnim: Animation | null = null;
            let pulseAnim: Animation | null = null;
            let pulseScaleAnim: Animation | null = null;

            // 値が変わった瞬間にバウンス (defer で初期マウントは skip)。
            // PM 盤面のみ実質発火する: AM/merged は num が常に固定なので no-op。
            // 連打時に前のバウンスが残らないよう cancel してから start する。
            createEffect(on(num, () => {
              if (!groupRef) return;
              bounceAnim?.cancel();
              bounceAnim = animateMotion(groupRef, NUMBER_BOUNCE_KEYFRAMES, {
                duration: NUMBER_BOUNCE_DURATION_MS,
                easing: "ease-out",
              });
            }, { defer: true }));

            // 12 ドゥンドゥドゥンッ × 2: PM 盤面の position 0 (= てっぺんの 12) のみ。
            // 12 は値不変で stagger bounce が走らないので、代わりに 2 サイクル分ふわっと弾ませて
            // 「12 を足す」操作の主役だと示す。
            //
            // 1 サイクルの rhythm: ドゥン (中くらいの bounce) → ドゥ (やや沈み) → ドゥンッ
            // (大きめの bounce で頂点 + snap) → 少しホールド → 完全に戻る. これを 2 回。
            // ease-in-out で各 keyframe 間の遷移を滑らかにし、staccato じゃなく波打ち感に。
            //
            // 2 つの WAAPI animation を同時に走らせる:
            //   - text  : fill を originalFill ⇄ FLASH_FILL で同期点滅 (色は属性から読んで戻す)
            //   - group : scale を波形でアニメ (overlay 不使用、本体の <g> を膨らませる)
            // group には既に transform-box: fill-box; transform-origin: center が当たっているので
            // 12 と (badge mode 時の) 円が中心からふくらむ。
            //
            // 競合: 同 group の bounceAnim は num 変化で走るが、position 0 PM は num 不変で
            // bounceAnim が発火しないので transform の取り合いは起きない。
            createEffect(on(prerollKey, () => {
              if (position !== 0 || props.period !== "pm") return;
              if (!textRef || !groupRef) return;
              pulseAnim?.cancel();
              pulseScaleAnim?.cancel();
              const originalFill = textRef.getAttribute("fill") || "#111111";
              // ゲーム / サイバーパンク調のネオン管を意識した電撃グリーン. filter なしで
              // 光って見せたいので、点灯中に hue を微妙に shift して「ネオンが humming
              // してる」フィーリングを出す: 純ネオン緑 #00FF80 → シアン緑 #00FFAA → 戻る.
              const NEON_ON = "#00FF80";
              const NEON_HUM = "#00FFAA";
              pulseAnim = animateMotion(textRef, [
                { fill: originalFill, offset: 0 },
                { fill: NEON_ON,      offset: 0.04 },  // 1st: 点灯
                { fill: NEON_HUM,     offset: 0.22 },  // 1st: humming で cyan 寄りへ
                { fill: NEON_ON,      offset: 0.42 },  // 1st: 緑に戻ってホールド終わり
                { fill: originalFill, offset: 0.50 },  // 1st: 切れる (ンッ)
                { fill: originalFill, offset: 0.55 },  // 間
                { fill: NEON_ON,      offset: 0.59 },  // 2nd
                { fill: NEON_HUM,     offset: 0.77 },
                { fill: NEON_ON,      offset: 0.96 },
                { fill: originalFill, offset: 1 },
              ], {
                duration: PULSE_MS * 2,
                easing: "ease-in-out",
              });
              pulseScaleAnim = animateMotion(groupRef, [
                { transform: "scale(1)",    offset: 0 },
                // 1st サイクル: ドゥン → ドゥ → ドゥンッ → settle → hold → snap
                { transform: "scale(1.30)", offset: 0.07 },  // ドゥン (中)
                { transform: "scale(1.18)", offset: 0.14 },  // ドゥ (沈み)
                { transform: "scale(1.45)", offset: 0.22 },  // ドゥンッ (大 + snap)
                { transform: "scale(1.32)", offset: 0.32 },  // settle
                { transform: "scale(1.30)", offset: 0.42 },  // ホールド
                { transform: "scale(1)",    offset: 0.50 },  // 戻る
                { transform: "scale(1)",    offset: 0.55 },  // 間
                // 2nd サイクル: 同じパターン
                { transform: "scale(1.30)", offset: 0.62 },
                { transform: "scale(1.18)", offset: 0.69 },
                { transform: "scale(1.45)", offset: 0.77 },
                { transform: "scale(1.32)", offset: 0.86 },
                { transform: "scale(1.30)", offset: 0.96 },
                { transform: "scale(1)",    offset: 1 },
              ], {
                duration: PULSE_MS * 2,
                easing: "ease-in-out",
              });
            }, { defer: true }));

            return (
              <g
                ref={groupRef}
                style={{
                  "transform-box": "fill-box",
                  "transform-origin": "center",
                }}
              >
                <Show when={colorMode() === "badge"}>
                  <circle cx={x()} cy={y()} r={18} fill={color()!.badge} />
                </Show>
                <text
                  ref={textRef}
                  x={x()}
                  y={y()}
                  text-anchor="middle"
                  dominant-baseline="central"
                  font-size={
                    colorMode() === "badge"
                      // ばっじ×すっきり×ものとーんはバッジの円が白で消えるので数字を少し大きく。
                      ? (paletteId() === "monotone" && !isKuwashiku()
                          ? (num() >= 10 ? "24" : "30")
                          : (num() >= 10 ? "18" : "24"))
                      : isKuwashiku()
                        ? (num() >= 10 ? "24" : "28")
                        : (num() >= 10 ? "32" : "36")
                  }
                  font-weight="900"
                  font-family="Nunito, sans-serif"
                  fill={colorMode() === "badge" ? color()!.text : "#111111"}
                  stroke={colorMode() === "sector" ? "#ffffff" : "none"}
                  stroke-width={colorMode() === "sector" ? (isKuwashiku() ? "4" : "5") : "0"}
                  paint-order="stroke"
                >
                  {num()}
                </text>
              </g>
            );
          }}
        </Index>

        {/* 12h ⇄ 24h トグル時の preroll: 12 を震源にした衝撃波リング 1 本.
            12 自体の色変化は上の <text ref={textRef}> の pulseAnim 側で担当.
            数字が変わる PM 盤面でのみ意味があるので Show でマウント. */}
        <Show when={props.period === "pm"}>
          <TimeFormatPrerollFx centerX={CX} centerY={CY - NUM_R()} />
        </Show>

        {/* 時針・分針・中心ネジは HandsLayer に分離。ScheduleLayer の上に乗せたいため。 */}
      </svg>
    </div>
  );
};

export default ClockFace;
