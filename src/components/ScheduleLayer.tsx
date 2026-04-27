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
import { animateMotion } from "../lib/motion";

/**
 * 時計の上に予定アイコンを描画するレイヤー。ClockFace を包む div の中に絶対配置で重ねる
 * (ClockFace SVG とは独立 SVG)。同じ viewBox (340x340) を使うので座標系が一致する。
 *
 * インタラクション: 短押しで poyon、長押し 500ms で warning (右上に ✕ ボタン)、✕ タップで削除
 * アニメ後にデータ削除。warning は外タップ or 3 秒経過でキャンセル。
 */

interface ScheduleLayerProps {
  period: "am" | "pm";
  /** レイヤー全体のスケール (1 で等倍)。merged β 表示の後ろレイヤーで奥行きを出す用。 */
  scale?: number;
  /** レイヤー全体に直接かける opacity。merged β の後ろレイヤーを薄くする等で使う。 */
  opacity?: number;
  /** 親側が薄い側 (反対 period のプレビュー中, merged β 後ろレイヤー等) なら true。
   *  window 外の event は dimOpacity に薄く、window 内は dim 無視で 1.0 に保つ。 */
  dimmed?: boolean;
  /** dimmed=true 時の event 薄さ (default 0.25)。merged β 後ろは 0.15 等で奥行き強調。 */
  dimOpacity?: number;
  /** 現在表示中の時刻 (0..1439 整数, 分単位)。一致するイベントは continuous でポヨポヨする。 */
  displayedMinutes: number;
}

const VIEW = 340;
const CENTER = VIEW / 2;

const ICON_RADIUS_KUWASHIKU = 84;
const ICON_RADIUS_SUKKIRI = 94;
const ICON_SIZE_KUWASHIKU = 18;
const ICON_SIZE_SUKKIRI = 24;
/** font-size に対する白背景円の半径比 (em-box 外接円 √2/2 ≈ 0.707 より少し小さく抑える)。 */
const ICON_BG_RADIUS_RATIO = 0.70;

/** 矢印三角形 (白)。底辺の両端が白円周上にぴったり乗るよう sqrt(bgR² - baseHalf²) で算出。 */
const TRI_BASE_HALF = 1.5;
const TRI_HEIGHT = 2.5;

const LONG_PRESS_MS = 500;
/** タップ判定の追加バッファ (viewBox 単位)。子どもの指でも当てやすくするための透明拡張領域。 */
const ICON_TOUCH_BUFFER = 16;
/** ✕ボタンのタップ判定半径。視認可能な赤円 (DELETE_BUTTON_RADIUS=7) より大きめに取る。 */
const DELETE_BUTTON_TOUCH_RADIUS = 26;


/** ポヨン3 (3 段の高速バウンス)。タップ + マッチ window 入り口の one-shot で共通使用。 */
const POYON3_DURATION_MS = 400;
const POYON3_KEYFRAMES: Keyframe[] = [
  { transform: "scale(1)",    offset: 0 },
  { transform: "scale(1.22)", offset: 0.13 },  // 1 段目 up
  { transform: "scale(0.90)", offset: 0.26 },  // 1 段目 down
  { transform: "scale(1.16)", offset: 0.43 },  // 2 段目 up
  { transform: "scale(0.94)", offset: 0.56 },  // 2 段目 down
  { transform: "scale(1.10)", offset: 0.74 },  // 3 段目 up
  { transform: "scale(1)",    offset: 1 },     // 着地
];

/** マッチ中の continuous loop。0..42% にバウンス + わずかな rotation で躍動感、42..100% は scale 1 で rest。 */
const MATCH_LOOP_DURATION_MS = 1500;
const MATCH_LOOP_KEYFRAMES: Keyframe[] = [
  { transform: "scale(1) rotate(0deg)",     offset: 0 },
  { transform: "scale(1.28) rotate(-3deg)", offset: 0.05 },
  { transform: "scale(0.85) rotate(3deg)",  offset: 0.12 },
  { transform: "scale(0.88) rotate(2deg)",  offset: 0.18 },
  { transform: "scale(1.18) rotate(-2deg)", offset: 0.28 },
  { transform: "scale(0.94) rotate(0deg)",  offset: 0.36 },
  { transform: "scale(1) rotate(0deg)",     offset: 0.42 },
  { transform: "scale(1) rotate(0deg)",     offset: 1 },
];

/** くるくる〜パッ (削除アニメ)。0..65% は等速で 720° 回転、65..100% で +360° しながら scale/opacity を 0 へ。 */
const POOF_DURATION_MS = 900;

/** displayed - eventM の差を [-720, 720] に正規化 (0/1440 跨ぎ対応)。 */
const wrapMinuteDiff = (diff: number): number => {
  while (diff > 720) diff -= 1440;
  while (diff < -720) diff += 1440;
  return diff;
};

/** ポヨポヨアニメ用 window。通常 2 分前から、天頂位置 (AM 0:00 / PM 12:00) のみ 5 分前から (AM/PM 境目を強調)。 */
const MATCH_WINDOW_MINUTES_BEFORE = 2;
const MATCH_WINDOW_MINUTES_BEFORE_NOON = 5;
const isWithinMatchWindow = (displayed: number, eventM: number): boolean => {
  const diff = wrapMinuteDiff(displayed - eventM);
  const before = (eventM === 0 || eventM === 720)
    ? MATCH_WINDOW_MINUTES_BEFORE_NOON
    : MATCH_WINDOW_MINUTES_BEFORE;
  return diff >= -before && diff <= 0;
};

/** 「dim 側でもハッキリ見せる」用 window。ポヨポヨ window と分離してあるのは目的が違うため
 *  (ポヨポヨ = アニメで気を引く / 見える = もうすぐ来る予告)。 */
const VISIBILITY_WINDOW_MINUTES_BEFORE = 2;
const isWithinVisibilityWindow = (displayed: number, eventM: number): boolean => {
  const diff = wrapMinuteDiff(displayed - eventM);
  return diff >= -VISIBILITY_WINDOW_MINUTES_BEFORE && diff <= 0;
};

/** お昼予定 (12:00〜12:59) の特例。絶対時刻で「お昼の準備〜余韻」(06:01〜17:59) のみ opacity 1、
 *  それ以外は dimOpacity に上書き (active 側でも特例で薄くなる)。撤去なら eventOpacity 内の
 *  isLunchEvent 分岐 3 行を消すだけで通常ロジックに戻る。 */
const LUNCH_EVENT_MINUTES_START = 720;
const LUNCH_EVENT_MINUTES_END = 779;
const LUNCH_VISIBLE_HOURS_START = 361;
const LUNCH_VISIBLE_HOURS_END = 1079;
const isLunchEvent = (eventM: number): boolean =>
  eventM >= LUNCH_EVENT_MINUTES_START && eventM <= LUNCH_EVENT_MINUTES_END;
const isInLunchVisibleHours = (displayed: number): boolean =>
  displayed >= LUNCH_VISIBLE_HOURS_START && displayed <= LUNCH_VISIBLE_HOURS_END;

const DELETE_BUTTON_OFFSET = 10;
const DELETE_BUTTON_RADIUS = 7;

const ScheduleLayer: Component<ScheduleLayerProps> = (props) => {
  const isKuwashiku = () => detailMode() === "kuwashiku";
  const iconRadius = () => isKuwashiku() ? ICON_RADIUS_KUWASHIKU : ICON_RADIUS_SUKKIRI;
  const iconFontSize = () => isKuwashiku() ? ICON_SIZE_KUWASHIKU : ICON_SIZE_SUKKIRI;
  const iconBgRadius = () => iconFontSize() * ICON_BG_RADIUS_RATIO;

  const eventsForPeriod = createMemo<ScheduleEvent[]>(() => {
    const isPm = props.period === "pm";
    const result: ScheduleEvent[] = [];
    for (const [m, id] of Object.entries(schedule())) {
      const minutes = Number(m);
      if ((minutes >= 720) === isPm) {
        result.push({ minutes, iconId: id });
      }
    }
    // 時刻 降順でソート → SVG document order の末尾 (= 最前面) に若い時刻が来る。
    // 同位置帯で重なった時に「早い時刻が手前」の stack 表示になる。
    result.sort((a, b) => b.minutes - a.minutes);
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

  /** warning/deleting 中のイベントがこのレイヤーに属するか (= ✕ボタンを出すか)。 */
  const activeInThisLayer = createMemo(() => {
    const i = interaction();
    if (i.type === "none") return null;
    const isAm = i.minutes < 720;
    if ((props.period === "am" && isAm) || (props.period === "pm" && !isAm)) {
      return i;
    }
    return null;
  });

  const deleteButtonPos = createMemo(() => {
    const a = activeInThisLayer();
    if (!a || a.type !== "warning") return null;
    const iconPos = positionOf(a.minutes);
    return { x: iconPos.x + DELETE_BUTTON_OFFSET, y: iconPos.y - DELETE_BUTTON_OFFSET };
  });

  // event ごとの opacity 優先順:
  //   お昼予定特例       → 絶対時刻 06:01〜17:59 のみ 1、それ以外は dimOpacity (active 側も上書き)
  //   dimmed && !visible → dimOpacity (薄い側で予告外の予定)
  //   dimmed && visible  → 1.0 (薄い側でも "もうすぐ起きる予定" はハッキリ)
  //   !dimmed            → 1.0
  // merged 表示中は親 wrapper opacity=0 で全体が隠れるので event 単位で隠す必要は無い。
  const eventOpacity = (visibleInDim: boolean, eventM: number): number => {
    if (isLunchEvent(eventM)) {
      return isInLunchVisibleHours(props.displayedMinutes) ? 1 : (props.dimOpacity ?? 0.25);
    }
    if (visibleInDim || !props.dimmed) return 1;
    return props.dimOpacity ?? 0.25;
  };

  return (
    <div
      class="absolute inset-0 flex items-center justify-center pointer-events-none"
      style={{
        opacity: props.opacity,
        transform: props.scale != null && props.scale !== 1 ? `scale(${props.scale})` : undefined,
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
              isMatched={isWithinMatchWindow(props.displayedMinutes, event.minutes)}
              opacity={eventOpacity(
                isWithinVisibilityWindow(props.displayedMinutes, event.minutes),
                event.minutes,
              )}
            />
          )}
        </For>

        {/* warning 中: SVG 全面の透明 rect で外タップを拾ってキャンセル。warning event がこの
            レイヤーに属する時のみ描画 (両レイヤーで描画すると merged β の dim 側予定の ✕ が
            上のレイヤーの cancel rect に覆われて押せなくなる)。 */}
        <Show when={activeInThisLayer()?.type === "warning"}>
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

        {/* ✕ボタン (warning event がこのレイヤーに属する時のみ、cancel rect の上に配置) */}
        <Show when={deleteButtonPos()}>
          {(pos) => (
            <g
              style={{ "pointer-events": "all", cursor: "pointer" }}
              onPointerDown={(e) => {
                e.stopPropagation();
                const a = activeInThisLayer();
                if (a && a.type === "warning") triggerDelete(a.minutes);
              }}
            >
              {/* 視認できる赤円より大きい透明判定円 (子どもの指で当てやすく) */}
              <circle
                cx={pos().x}
                cy={pos().y}
                r={DELETE_BUTTON_TOUCH_RADIUS}
                fill="transparent"
                style={{ "pointer-events": "all" }}
              />
              <circle cx={pos().x} cy={pos().y} r={DELETE_BUTTON_RADIUS + 1} fill="#C01030" />
              <circle cx={pos().x} cy={pos().y} r={DELETE_BUTTON_RADIUS} fill="#FF4060" />
              {/* ✕ は line ペアで描く (text "✕" よりクロス角度がきれい) */}
              <line
                x1={pos().x - DELETE_BUTTON_RADIUS * 0.45}
                y1={pos().y - DELETE_BUTTON_RADIUS * 0.45}
                x2={pos().x + DELETE_BUTTON_RADIUS * 0.45}
                y2={pos().y + DELETE_BUTTON_RADIUS * 0.45}
                stroke="#222222"
                stroke-width="2"
                stroke-linecap="round"
              />
              <line
                x1={pos().x - DELETE_BUTTON_RADIUS * 0.45}
                y1={pos().y + DELETE_BUTTON_RADIUS * 0.45}
                x2={pos().x + DELETE_BUTTON_RADIUS * 0.45}
                y2={pos().y - DELETE_BUTTON_RADIUS * 0.45}
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

interface EventIconProps {
  event: ScheduleEvent;
  pos: { x: number; y: number };
  triPoints: string;
  iconBgRadius: number;
  iconFontSize: number;
  /** 現在の displayed time がこのイベント時刻と一致しているか (連続ポヨポヨ用)。 */
  isMatched: boolean;
  /** ScheduleLayer が決めたこの event 単体の表示 opacity (0..1)。
   *  .fade-on-dim class で 380ms transition (親 .selection-dim-instant 中は 0ms)。 */
  opacity: number;
}

const EventIcon: Component<EventIconProps> = (props) => {
  let groupRef: SVGGElement | undefined;
  let pressTimer: ReturnType<typeof setTimeout> | undefined;
  let longPressed = false;
  let wobbleAnim: Animation | null = null;
  let matchAnim: Animation | null = null;

  const def = () => getScheduleIcon(props.event.iconId);

  const isWarning = createMemo(() => {
    const i = interaction();
    return i.type === "warning" && i.minutes === props.event.minutes;
  });
  const isDeleting = createMemo(() => {
    const i = interaction();
    return i.type === "deleting" && i.minutes === props.event.minutes;
  });

  // ホワホワ (wobble): warning 中は ±4° の往復アニメを継続。
  createEffect(() => {
    if (!groupRef) return;
    if (isWarning()) {
      wobbleAnim?.cancel();
      wobbleAnim = animateMotion(
        groupRef,
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
      wobbleAnim = null;
    }
  });

  // くるくる〜パッ: deleting 開始で 1 回だけ。0..65% は 720° 回転だけ、65..100% で +360° しつつ scale/opacity を 0 へ。
  createEffect(on(isDeleting, (deleting) => {
    if (!groupRef || !deleting) return;
    animateMotion(
      groupRef,
      [
        { transform: "rotate(0deg) scale(1)", opacity: 1, offset: 0 },
        { transform: "rotate(720deg) scale(1)", opacity: 1, offset: 0.65 },
        { transform: "rotate(1080deg) scale(0)", opacity: 0, offset: 1 },
      ],
      { duration: POOF_DURATION_MS, easing: "linear", fill: "forwards" }
    );
  }));

  const triggerPoyon3 = () => {
    if (!groupRef) return;
    animateMotion(groupRef, POYON3_KEYFRAMES, {
      duration: POYON3_DURATION_MS,
      easing: "ease-out",
    });
  };

  // マッチ window 入った瞬間に one-shot ポヨン3 を投入。自動回転で window が 50ms しか開かなくても
  // 自身の duration (400ms) を完走する。下の continuous loop effect より「先に」定義しないと、
  // 後発の continuous が WAAPI composite で勝って one-shot が見えなくなる。
  // defer なし: mount 時 isMatched=true (window 内で表示開始) でも発火させたい。
  createEffect(on(
    () => props.isMatched,
    (matched) => {
      if (!groupRef || !matched) return;
      if (isWarning() || isDeleting()) return;
      triggerPoyon3();
    },
  ));

  // マッチ中 continuous: 1 周期 = バウンス前半 42% + rest 後半 58%。warning/deleting 中は他アニメと干渉するので止める。
  createEffect(() => {
    if (!groupRef) return;
    if (isWarning() || isDeleting()) {
      matchAnim?.cancel();
      matchAnim = null;
      return;
    }
    if (props.isMatched) {
      if (!matchAnim) {
        matchAnim = animateMotion(groupRef, MATCH_LOOP_KEYFRAMES, {
          duration: MATCH_LOOP_DURATION_MS,
          iterations: Infinity,
          easing: "ease-out",
        });
      }
    } else {
      matchAnim?.cancel();
      matchAnim = null;
    }
  });

  const onPointerDown = (e: PointerEvent) => {
    e.stopPropagation();
    // 別イベントが warning/deleting 中は新規操作を受け付けない。
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
    // 長押し発火済みなら何もしない (既に warning へ移行済み)。
    if (!longPressed && interaction().type === "none") {
      triggerPoyon3();
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
    matchAnim?.cancel();
  });

  return (
    <Show when={def()}>
      <g
        ref={groupRef}
        class="fade-on-dim"
        style={{
          // bbox 中心を transform 原点に → 回転/拡縮がアイコン中心まわりで起きる。
          "transform-box": "fill-box",
          "transform-origin": "center",
          "pointer-events": "auto",
          cursor: "pointer",
          opacity: props.opacity,
        }}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
      >
        {/* 視認できる白円より大きい透明判定円。pointer-events: all で透明領域でもヒット
            (default visiblePainted は alpha 0 でヒットしない)。 */}
        <circle
          cx={props.pos.x}
          cy={props.pos.y}
          r={props.iconBgRadius + ICON_TOUCH_BUFFER}
          fill="transparent"
          style={{ "pointer-events": "all" }}
        />
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
