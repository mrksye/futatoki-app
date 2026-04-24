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
 * 短針との被りを避けるため、可能な範囲で外側 (時間数字寄り) に配置:
 *   くわしく (R=130): hand-tip=65, band-inner=96 → 85 (中心)
 *   すっきり (R=148): hand-tip=74, band-inner=114 → 95 (中心)
 * 数字 (R-18) や色帯 (R) には届かない範囲。
 */
const ICON_RADIUS_KUWASHIKU = 84;
const ICON_RADIUS_SUKKIRI = 94;

/** 絵文字グリフのフォントサイズ (viewBox 単位)。アイコン半径 ± ICON_SIZE/2 で短針/数字に被らない。 */
const ICON_SIZE_KUWASHIKU = 18;
const ICON_SIZE_SUKKIRI = 24;

/**
 * アイコン背景の白円: 絵文字を白で囲んで、色帯やアイコン同士の上でも視認性を担保する。
 * em-box (font-size 四方) を囲む外接円の半径は font-size * √2/2 ≈ 0.707 倍。
 * 横長/縦長の emoji (🛌, 🚌 等) も収めつつ、見た目のサイズ感を抑えて 0.71 倍。
 */
const ICON_BG_RADIUS_RATIO = 0.70;

/**
 * 矢印マーク (アイコンの内側=短針先端側に置く小さな三角形)。
 * 白背景円の内周に base が沿う形で、頂点は白円の外側 (= 短針の方向、クロック中心側) を指す。
 * 「この絵文字はこの時刻ぴったり」を方向性をもって示す指示子。
 */
const TRI_BASE_HALF = 1.5;  // 底辺の半幅 (viewBox 単位)
const TRI_HEIGHT = 2.5;     // 底辺から頂点までの高さ

const ScheduleLayer: Component<ScheduleLayerProps> = (props) => {
  const isKuwashiku = () => detailMode() === "kuwashiku";
  const iconRadius = () => isKuwashiku() ? ICON_RADIUS_KUWASHIKU : ICON_RADIUS_SUKKIRI;
  const iconFontSize = () => isKuwashiku() ? ICON_SIZE_KUWASHIKU : ICON_SIZE_SUKKIRI;
  const iconBgRadius = () => iconFontSize() * ICON_BG_RADIUS_RATIO;

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
  const angleRadOf = (minutes: number) => ((minutes / 2 - 90) * Math.PI) / 180;

  const positionOf = (minutes: number) => {
    const angleRad = angleRadOf(minutes);
    return {
      x: CENTER + iconRadius() * Math.cos(angleRad),
      y: CENTER + iconRadius() * Math.sin(angleRad),
    };
  };

  /**
   * 矢印三角形の3頂点 (SVG polygon points 形式の文字列)。
   * 底辺の両端点を白円の周上 (= 中心から iconBgRadius 距離の円周) にピッタリ乗せる。
   * これで底辺の弦が白円の弧と境界線で滑らかに接続する (両端がはみ出ない/凹まない)。
   * 頂点はクロック中心方向に TRI_HEIGHT だけ突出。
   */
  const trianglePointsOf = (minutes: number): string => {
    const angleRad = angleRadOf(minutes);
    const cosA = Math.cos(angleRad);
    const sinA = Math.sin(angleRad);

    // 底辺の両端点 (left, right) を白円周上に乗せたい。
    // 弦の中点は円中心 (アイコン中心) からの距離 sqrt(bgR^2 - baseHalf^2) の位置になる。
    const bgR = iconBgRadius();
    const chordMidDistFromIconCenter =
      Math.sqrt(bgR * bgR - TRI_BASE_HALF * TRI_BASE_HALF);

    // クロック中心からの底辺中点距離 = アイコン中心距離 - 弦中点のアイコン中心からの距離
    const baseMidRadius = iconRadius() - chordMidDistFromIconCenter;
    const baseMidX = CENTER + baseMidRadius * cosA;
    const baseMidY = CENTER + baseMidRadius * sinA;

    // 半径方向に対する垂直 (CCW 90°回転)
    const perpX = -sinA;
    const perpY = cosA;

    const leftX = baseMidX + TRI_BASE_HALF * perpX;
    const leftY = baseMidY + TRI_BASE_HALF * perpY;
    const rightX = baseMidX - TRI_BASE_HALF * perpX;
    const rightY = baseMidY - TRI_BASE_HALF * perpY;

    // 頂点: 底辺中点からさらに中心方向に TRI_HEIGHT 突出
    const apexRadius = baseMidRadius - TRI_HEIGHT;
    const apexX = CENTER + apexRadius * cosA;
    const apexY = CENTER + apexRadius * sinA;

    return `${leftX},${leftY} ${rightX},${rightY} ${apexX},${apexY}`;
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
            const triPoints = () => trianglePointsOf(event.minutes);
            return (
              <Show when={def}>
                {/* 白い背景円 (アイコン視認性を担保) */}
                <circle
                  cx={pos().x}
                  cy={pos().y}
                  r={iconBgRadius()}
                  fill="#ffffff"
                />
                <text
                  x={pos().x}
                  y={pos().y}
                  font-size={iconFontSize()}
                  text-anchor="middle"
                  dominant-baseline="central"
                >
                  {def!.emoji}
                </text>
                {/* 矢印: 短針側に正確な分位置を指す */}
                <polygon
                  points={triPoints()}
                  fill="#ffffff"
                />
              </Show>
            );
          }}
        </For>
      </svg>
    </div>
  );
};

export default ScheduleLayer;
