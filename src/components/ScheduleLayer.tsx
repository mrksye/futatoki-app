import { For, Show, createMemo } from "solid-js";
import type { Component } from "solid-js";
import { schedule, type ScheduleEvent } from "../features/schedule/state";
import { getScheduleIcon } from "../features/schedule/icons";
import { detailMode } from "../features/settings/detail-mode";

/**
 * 時計の上に予定アイコンを描画するレイヤー。
 *
 * AnalogClock とは独立した SVG として、AnalogClock を包む div の中に絶対配置で重ねる。
 * (「分離できるものは常に分離する」原則: AnalogClock の SVG には統合しない)
 *
 * 同じ viewBox (340x340) を使うので、AnalogClock の盤面と座標系が完全に一致する。
 * リサイズ時もズレない。
 *
 * Props:
 *   - period:  "am" / "pm" / "merged"
 *               am  = 0..11 時のイベントだけ描画 (分け表示の AM 盤面用)
 *               pm  = 12..23 時のイベントだけ描画 (分け表示の PM 盤面用)
 *               merged = 全イベント描画 (重ね表示用、後ろレイヤーは opacity を別途指定)
 *   - opacity: レイヤー全体の不透明度 (β レンダリングで後ろレイヤーを薄くする時に使う)
 *   - zIndex:  レイヤーの z 順 (β レンダリングで前後関係を制御)
 *
 * ポインタイベントは pointer-events-none (各イベントアイコンは Phase 3 で個別に有効化)。
 */

interface ScheduleLayerProps {
  period: "am" | "pm" | "merged";
  opacity?: number;
  zIndex?: number;
}

const VIEW = 340;
const CENTER = VIEW / 2;

/**
 * アイコンの中心半径 (viewBox 単位)。短針先端 (R*0.5) と色帯内側 (R-34) の間に収める。
 *   くわしく (R=130): hand-tip=65, band-inner=96 → 80 (中心)
 *   すっきり (R=148): hand-tip=74, band-inner=114 → 90 (中心)
 * 数字 (R-18) や色帯 (R) には届かない安全圏。
 */
const ICON_RADIUS_KUWASHIKU = 80;
const ICON_RADIUS_SUKKIRI = 90;

/** 絵文字グリフのフォントサイズ (viewBox 単位)。アイコン半径 ± 14 で短針/数字に被らない。 */
const ICON_SIZE_KUWASHIKU = 22;
const ICON_SIZE_SUKKIRI = 28;

const ScheduleLayer: Component<ScheduleLayerProps> = (props) => {
  const isKuwashiku = () => detailMode() === "kuwashiku";
  const iconRadius = () => isKuwashiku() ? ICON_RADIUS_KUWASHIKU : ICON_RADIUS_SUKKIRI;
  const iconFontSize = () => isKuwashiku() ? ICON_SIZE_KUWASHIKU : ICON_SIZE_SUKKIRI;

  // period 指定に従って表示対象イベントを抽出。
  // schedule() はオブジェクトなので Object.entries で配列化、minutes は string→number 化。
  const eventsForPeriod = createMemo<ScheduleEvent[]>(() => {
    const all = schedule();
    const result: ScheduleEvent[] = [];
    for (const [m, id] of Object.entries(all)) {
      const minutes = Number(m);
      const isAm = minutes < 720;
      if (props.period === "merged"
        || (props.period === "am" && isAm)
        || (props.period === "pm" && !isAm)
      ) {
        result.push({ minutes, iconId: id });
      }
    }
    return result;
  });

  /**
   * イベントの描画位置 (viewBox 単位)。
   * hour-hand 角度 = (minutes/60) * 30 = minutes/2 (deg, 12時=0, 3時=90)
   * SVG 標準座標は 0deg=右、CW 正なので 12時=-90deg にオフセット。
   */
  const positionOf = (minutes: number) => {
    const hourAngleDeg = minutes / 2;
    const angleRad = ((hourAngleDeg - 90) * Math.PI) / 180;
    return {
      x: CENTER + iconRadius() * Math.cos(angleRad),
      y: CENTER + iconRadius() * Math.sin(angleRad),
    };
  };

  return (
    <div
      class="absolute inset-0 flex items-center justify-center pointer-events-none"
      style={{
        opacity: props.opacity ?? 1,
        "z-index": props.zIndex,
      }}
    >
      <svg
        viewBox={`0 0 ${VIEW} ${VIEW}`}
        class="w-full h-full"
        style="max-height: 100%; max-width: 100%;"
      >
        <For each={eventsForPeriod()}>
          {(event) => {
            const def = getScheduleIcon(event.iconId);
            const pos = () => positionOf(event.minutes);
            return (
              <Show when={def}>
                <text
                  x={pos().x}
                  y={pos().y}
                  font-size={iconFontSize()}
                  text-anchor="middle"
                  dominant-baseline="central"
                >
                  {def!.emoji}
                </text>
              </Show>
            );
          }}
        </For>
      </svg>
    </div>
  );
};

export default ScheduleLayer;
