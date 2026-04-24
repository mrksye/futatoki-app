import { For, Show, createEffect, createMemo, on, onCleanup } from "solid-js";
import type { Component } from "solid-js";
import { schedule, type ScheduleEvent } from "../features/schedule/state";
import { getScheduleIcon } from "../features/schedule/icons";
import {
  interaction,
  enterWarning,
  cancelWarning,
  triggerDelete,
} from "../features/schedule/interaction";
import { detailMode } from "../features/settings/detail-mode";

/**
 * 時計の上に予定アイコンを描画するレイヤー。
 *
 * AnalogClock とは独立した SVG として、ClockFace を包む div の中に絶対配置で重ねる。
 * (「分離できるものは常に分離する」原則: ClockFace の SVG には統合しない)
 *
 * 同じ viewBox (340x340) を使うので、ClockFace の盤面と座標系が完全に一致する。
 *
 * Props:
 *   - period:  "am" / "pm"  描画対象のイベントを時刻でフィルタ
 *   - opacity: レイヤー全体の不透明度 (β レンダリングで後ろレイヤーを薄くする時に使う)
 *   - zIndex:  レイヤーの z 順 (β レンダリングで前後関係を制御)
 *
 * インタラクション:
 *   - 各アイコン: 短押しで poyon (ぴょん) アニメ、長押し 500ms で warning 状態に
 *   - warning 中: そのアイコンが wobble (ホワホワ)、右上に 🗑️ 吹き出し出現
 *   - 🗑️ タップ: 回転＋縮小＋フェードで削除アニメ後にデータ削除
 *   - キャンセル: warning 中の SVG 内空タップ、または 3 秒経過
 */

interface ScheduleLayerProps {
  period: "am" | "pm";
  opacity?: number;
  zIndex?: number;
}

const VIEW = 340;
const CENTER = VIEW / 2;

const ICON_RADIUS_KUWASHIKU = 84;
const ICON_RADIUS_SUKKIRI = 94;
const ICON_SIZE_KUWASHIKU = 18;
const ICON_SIZE_SUKKIRI = 24;
/** font-size に対する白背景円の半径比 (em-box 外接円 √2/2 ≈ 0.707 より少し小さく抑える) */
const ICON_BG_RADIUS_RATIO = 0.70;

/** 矢印三角形 (白)。底辺の両端が白円周上にぴったり乗るよう sqrt(bgR² - baseHalf²) で算出。 */
const TRI_BASE_HALF = 1.5;
const TRI_HEIGHT = 2.5;

/** インタラクション関連 */
const LONG_PRESS_MS = 500;
const POYON_DURATION_MS = 350;
/** くるくる〜パッ: 0..65% は等速で 720° 回転 (見せ場)、65..100% で +360° 回転しながら縮小+フェード */
const POOF_DURATION_MS = 900;

/** 削除ボタン (✕ 印の赤い丸吹き出し) */
const TRASH_OFFSET = 10;
const TRASH_RADIUS = 7;

const ScheduleLayer: Component<ScheduleLayerProps> = (props) => {
  const isKuwashiku = () => detailMode() === "kuwashiku";
  const iconRadius = () => isKuwashiku() ? ICON_RADIUS_KUWASHIKU : ICON_RADIUS_SUKKIRI;
  const iconFontSize = () => isKuwashiku() ? ICON_SIZE_KUWASHIKU : ICON_SIZE_SUKKIRI;
  const iconBgRadius = () => iconFontSize() * ICON_BG_RADIUS_RATIO;

  const eventsForPeriod = createMemo<ScheduleEvent[]>(() => {
    const all = schedule();
    const result: ScheduleEvent[] = [];
    for (const [m, id] of Object.entries(all)) {
      const minutes = Number(m);
      const isAm = minutes < 720;
      if ((props.period === "am" && isAm) || (props.period === "pm" && !isAm)) {
        result.push({ minutes, iconId: id });
      }
    }
    return result;
  });

  const angleRadOf = (minutes: number) => ((minutes / 2 - 90) * Math.PI) / 180;

  const positionOf = (minutes: number) => {
    const angleRad = angleRadOf(minutes);
    return {
      x: CENTER + iconRadius() * Math.cos(angleRad),
      y: CENTER + iconRadius() * Math.sin(angleRad),
    };
  };

  const trianglePointsOf = (minutes: number): string => {
    const angleRad = angleRadOf(minutes);
    const cosA = Math.cos(angleRad);
    const sinA = Math.sin(angleRad);

    const bgR = iconBgRadius();
    const chordMidDistFromIconCenter = Math.sqrt(bgR * bgR - TRI_BASE_HALF * TRI_BASE_HALF);
    const baseMidRadius = iconRadius() - chordMidDistFromIconCenter;
    const baseMidX = CENTER + baseMidRadius * cosA;
    const baseMidY = CENTER + baseMidRadius * sinA;

    const perpX = -sinA;
    const perpY = cosA;

    const leftX = baseMidX + TRI_BASE_HALF * perpX;
    const leftY = baseMidY + TRI_BASE_HALF * perpY;
    const rightX = baseMidX - TRI_BASE_HALF * perpX;
    const rightY = baseMidY - TRI_BASE_HALF * perpY;

    const apexRadius = baseMidRadius - TRI_HEIGHT;
    const apexX = CENTER + apexRadius * cosA;
    const apexY = CENTER + apexRadius * sinA;

    return `${leftX},${leftY} ${rightX},${rightY} ${apexX},${apexY}`;
  };

  /** warning/deleting 中のイベントがこのレイヤーに属するか (= ゴミ箱を出すか) */
  const activeInThisLayer = createMemo(() => {
    const i = interaction();
    if (i.type === "none") return null;
    const isAm = i.minutes < 720;
    if ((props.period === "am" && isAm) || (props.period === "pm" && !isAm)) {
      return i;
    }
    return null;
  });

  const trashPos = createMemo(() => {
    const a = activeInThisLayer();
    if (!a || a.type !== "warning") return null;
    const iconPos = positionOf(a.minutes);
    return { x: iconPos.x + TRASH_OFFSET, y: iconPos.y - TRASH_OFFSET };
  });

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
          {(event) => (
            <EventIcon
              event={event}
              pos={positionOf(event.minutes)}
              triPoints={trianglePointsOf(event.minutes)}
              iconBgRadius={iconBgRadius()}
              iconFontSize={iconFontSize()}
            />
          )}
        </For>

        {/* warning 中: SVG 全面の透明 rect で外タップを拾ってキャンセル。
            アイコンより後の document order で上に乗せる (= 下のアイコンへの pointer は届かない)。 */}
        <Show when={interaction().type === "warning"}>
          <rect
            x={0} y={0} width={VIEW} height={VIEW}
            fill="transparent"
            style={{ "pointer-events": "all" }}
            onPointerDown={(e) => {
              e.stopPropagation();
              cancelWarning();
            }}
          />
        </Show>

        {/* ゴミ箱吹き出し (warning event がこのレイヤーに属する時のみ、cancel rect の上に配置) */}
        <Show when={trashPos()}>
          {(pos) => (
            <g
              style={{ "pointer-events": "all", cursor: "pointer" }}
              onPointerDown={(e) => {
                e.stopPropagation();
                const a = activeInThisLayer();
                if (a && a.type === "warning") triggerDelete(a.minutes);
              }}
            >
              <circle cx={pos().x} cy={pos().y} r={TRASH_RADIUS + 1} fill="#C01030" />
              <circle cx={pos().x} cy={pos().y} r={TRASH_RADIUS} fill="#FF4060" />
              {/* ✕ 印は line ペアで描く (text の "✕" よりクロス角度がきれい) */}
              <line
                x1={pos().x - TRASH_RADIUS * 0.45}
                y1={pos().y - TRASH_RADIUS * 0.45}
                x2={pos().x + TRASH_RADIUS * 0.45}
                y2={pos().y + TRASH_RADIUS * 0.45}
                stroke="#222222"
                stroke-width="2"
                stroke-linecap="round"
              />
              <line
                x1={pos().x - TRASH_RADIUS * 0.45}
                y1={pos().y + TRASH_RADIUS * 0.45}
                x2={pos().x + TRASH_RADIUS * 0.45}
                y2={pos().y - TRASH_RADIUS * 0.45}
                stroke="#222222"
                stroke-width="2"
                stroke-linecap="round"
              />
            </g>
          )}
        </Show>
      </svg>
    </div>
  );
};

/* ============================================================================
 * EventIcon: 1 イベント = 1 サブコンポーネント。
 * ポインタイベント (短押し/長押し) と Web Animations API でのアニメーションを担う。
 * ============================================================================ */

interface EventIconProps {
  event: ScheduleEvent;
  pos: { x: number; y: number };
  triPoints: string;
  iconBgRadius: number;
  iconFontSize: number;
}

const EventIcon: Component<EventIconProps> = (props) => {
  let groupRef: SVGGElement | undefined;
  let pressTimer: ReturnType<typeof setTimeout> | undefined;
  let longPressed = false;
  let wobbleAnim: Animation | undefined;

  const def = () => getScheduleIcon(props.event.iconId);

  const isWarning = createMemo(() => {
    const i = interaction();
    return i.type === "warning" && i.minutes === props.event.minutes;
  });
  const isDeleting = createMemo(() => {
    const i = interaction();
    return i.type === "deleting" && i.minutes === props.event.minutes;
  });

  // ホワホワ (wobble): warning 中は ±4° の往復アニメを継続
  createEffect(() => {
    if (!groupRef) return;
    if (isWarning()) {
      wobbleAnim = groupRef.animate(
        [{ transform: "rotate(-4deg)" }, { transform: "rotate(4deg)" }],
        {
          duration: 180,
          iterations: Infinity,
          direction: "alternate",
          easing: "ease-in-out",
        }
      );
    } else {
      wobbleAnim?.cancel();
      wobbleAnim = undefined;
    }
  });

  // くるくる〜パッ (poof): deleting 開始で 1 回だけ走らせる
  // 0..65%: 等速で 720° 回転 (2周分の見せ場、scale/opacity 変化なし)
  // 65..100%: +360° (合計 1080°) しながら scale 1→0 + opacity 1→0
  createEffect(on(isDeleting, (deleting) => {
    if (!groupRef || !deleting) return;
    groupRef.animate(
      [
        { transform: "rotate(0deg) scale(1)", opacity: 1, offset: 0 },
        { transform: "rotate(720deg) scale(1)", opacity: 1, offset: 0.65 },
        { transform: "rotate(1080deg) scale(0)", opacity: 0, offset: 1 },
      ],
      { duration: POOF_DURATION_MS, easing: "linear", fill: "forwards" }
    );
  }));

  // ぴょん (poyon): タップごとに 1 回。Web Animations API は呼ぶたびに新しい Animation を作るので
  // class 切替の race condition を考えなくてよい。
  const triggerPoyon = () => {
    if (!groupRef) return;
    groupRef.animate(
      [
        { transform: "scale(1)" },
        { transform: "scale(1.18)", offset: 0.3 },
        { transform: "scale(0.9)", offset: 0.6 },
        { transform: "scale(1)" },
      ],
      { duration: POYON_DURATION_MS, easing: "ease-out" }
    );
  };

  const onPointerDown = (e: PointerEvent) => {
    e.stopPropagation();
    // 別イベントが warning/deleting 中は新規操作を受け付けない
    if (interaction().type !== "none") return;
    longPressed = false;
    pressTimer = setTimeout(() => {
      longPressed = true;
      enterWarning(props.event.minutes);
    }, LONG_PRESS_MS);
  };

  const onPointerUp = (e: PointerEvent) => {
    e.stopPropagation();
    if (pressTimer) {
      clearTimeout(pressTimer);
      pressTimer = undefined;
    }
    // 長押しが先に発火していたら何もしない (既に warning に入った)
    if (!longPressed && interaction().type === "none") {
      triggerPoyon();
    }
  };

  const onPointerCancel = () => {
    if (pressTimer) {
      clearTimeout(pressTimer);
      pressTimer = undefined;
    }
  };

  onCleanup(() => {
    if (pressTimer) clearTimeout(pressTimer);
    wobbleAnim?.cancel();
  });

  return (
    <Show when={def()}>
      <g
        ref={groupRef}
        style={{
          // bbox 中心を transform 原点にすることで、回転/拡縮がアイコン中心まわりで起きる
          "transform-box": "fill-box",
          "transform-origin": "center",
          "pointer-events": "auto",
          cursor: "pointer",
        }}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
      >
        <circle
          cx={props.pos.x}
          cy={props.pos.y}
          r={props.iconBgRadius}
          fill="#ffffff"
        />
        <text
          x={props.pos.x}
          y={props.pos.y}
          font-size={props.iconFontSize}
          text-anchor="middle"
          dominant-baseline="central"
        >
          {def()!.emoji}
        </text>
        <polygon points={props.triPoints} fill="#ffffff" />
      </g>
    </Show>
  );
};

export default ScheduleLayer;
