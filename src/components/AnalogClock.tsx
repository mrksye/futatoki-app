import { For, Show, createMemo } from "solid-js";
import type { Component } from "solid-js";
import { useSettings } from "../store/settings";
import { amColors, pmColors, type HourColor } from "../colors";

interface AnalogClockProps {
  period: "am" | "pm";
  hours: number;
  minutes: number;
  dimmed: boolean;
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

const AnalogClock: Component<AnalogClockProps> = (props) => {
  const { settings } = useSettings();

  const isKuwashiku = () => settings.detailMode === "kuwashiku";

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

  const colors = createMemo((): HourColor[] =>
    props.period === "am" ? amColors : pmColors,
  );

  const numbers = createMemo(() => {
    const is24h = settings.timeFormat === "24h";
    if (props.period === "am") {
      return Array.from({ length: 12 }, (_, i) => i === 0 ? 12 : i);
    }
    return Array.from({ length: 12 }, (_, i) =>
      is24h ? (i === 0 ? 12 : i + 12) : (i === 0 ? 12 : i),
    );
  });

  const hourAngle = createMemo(() => {
    const h = props.hours % 12;
    return (h + props.minutes / 60) * 30 - 90;
  });

  const minuteAngle = createMemo(() => {
    return props.minutes * 6 - 90;
  });

  return (
    <div
      class="w-full h-full flex items-center justify-center"
      style={{ opacity: props.dimmed ? 0.25 : 1, transition: "opacity 0.5s ease" }}
    >
      <svg viewBox={`0 0 ${VIEW} ${VIEW}`} class="w-full h-full" style="max-height: 100%; max-width: 100%;">
        <defs>
          <filter id={`shadow-${props.period}`}>
            <feDropShadow dx="0" dy="2" stdDeviation="4" flood-color="#00000030" />
          </filter>
        </defs>

        {/* 外側リング（細め） */}
        <circle
          cx={CX} cy={CY} r={OUTER_RING() + 2}
          fill={props.period === "am" ? "#0060B0" : "#C01850"}
          filter={`url(#shadow-${props.period})`}
        />
        <circle
          cx={CX} cy={CY} r={OUTER_RING()}
          fill={props.period === "am" ? "#0080D8" : "#E02068"}
        />

        {/* 文字盤（ほんのり色付き） */}
        <circle cx={CX} cy={CY} r={R()} fill={props.period === "am" ? "#d8e8f8" : "#f8d8e0"} />

        {/* 扇形モード */}
        <Show when={settings.colorMode === "sector"}>
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
        <Show when={settings.colorMode === "badge"}>
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

        {/* 時間の数字 */}
        <For each={numbers()}>
          {(num, i) => {
            const angle = () => (i() * 30 * Math.PI) / 180 - Math.PI / 2;
            const x = () => CX + NUM_R() * Math.cos(angle());
            const y = () => CY + NUM_R() * Math.sin(angle());
            const color = () => colors()[i()];

            return (
              <>
                <Show when={settings.colorMode === "badge"}>
                  <circle cx={x()} cy={y()} r={18} fill={color()!.badge} />
                </Show>
                <text
                  x={x()}
                  y={y()}
                  text-anchor="middle"
                  dominant-baseline="central"
                  font-size={
                    settings.colorMode === "badge"
                      ? (num >= 10 ? "18" : "24")
                      : isKuwashiku()
                        ? (num >= 10 ? "24" : "28")
                        : (num >= 10 ? "32" : "36")
                  }
                  font-weight="900"
                  font-family="Nunito, sans-serif"
                  fill={settings.colorMode === "badge" ? color()!.text : "#111111"}
                  stroke={settings.colorMode === "sector" ? "#ffffff" : "none"}
                  stroke-width={settings.colorMode === "sector" ? (isKuwashiku() ? "4" : "5") : "0"}
                  paint-order="stroke"
                >
                  {num}
                </text>
              </>
            );
          }}
        </For>

        {/* 時針 */}
        <line
          x1={CX - 12 * Math.cos((hourAngle() * Math.PI) / 180)}
          y1={CY - 12 * Math.sin((hourAngle() * Math.PI) / 180)}
          x2={CX + (R() * 0.5) * Math.cos((hourAngle() * Math.PI) / 180)}
          y2={CY + (R() * 0.5) * Math.sin((hourAngle() * Math.PI) / 180)}
          stroke="#ffffff"
          stroke-width="10"
          stroke-linecap="round"
        />
        <line
          x1={CX - 10 * Math.cos((hourAngle() * Math.PI) / 180)}
          y1={CY - 10 * Math.sin((hourAngle() * Math.PI) / 180)}
          x2={CX + (R() * 0.48) * Math.cos((hourAngle() * Math.PI) / 180)}
          y2={CY + (R() * 0.48) * Math.sin((hourAngle() * Math.PI) / 180)}
          stroke="#111111"
          stroke-width="7"
          stroke-linecap="round"
        />

        {/* 分針 */}
        <line
          x1={CX - 15 * Math.cos((minuteAngle() * Math.PI) / 180)}
          y1={CY - 15 * Math.sin((minuteAngle() * Math.PI) / 180)}
          x2={CX + (R() * 0.78) * Math.cos((minuteAngle() * Math.PI) / 180)}
          y2={CY + (R() * 0.78) * Math.sin((minuteAngle() * Math.PI) / 180)}
          stroke="#ffffff"
          stroke-width="6"
          stroke-linecap="round"
        />
        <line
          x1={CX - 13 * Math.cos((minuteAngle() * Math.PI) / 180)}
          y1={CY - 13 * Math.sin((minuteAngle() * Math.PI) / 180)}
          x2={CX + (R() * 0.76) * Math.cos((minuteAngle() * Math.PI) / 180)}
          y2={CY + (R() * 0.76) * Math.sin((minuteAngle() * Math.PI) / 180)}
          stroke="#111111"
          stroke-width="3.5"
          stroke-linecap="round"
        />

        {/* 中心ネジ */}
        <circle cx={CX} cy={CY} r="7" fill="white" />
        <circle cx={CX} cy={CY} r="5" fill="#111111" />
        <circle cx={CX} cy={CY} r="2" fill="white" />
      </svg>
    </div>
  );
};

export default AnalogClock;
