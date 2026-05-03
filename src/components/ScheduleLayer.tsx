import { For, Show, createEffect, createMemo, on, onCleanup } from "solid-js";
import type { Component } from "solid-js";
import { schedule, type ScheduleEvent } from "../features/schedule/state";
import { getScheduleIcon } from "../features/schedule/icons";
import {
  interaction,
  cancelWarning,
  triggerDelete,
  triggerResetDelete,
  RESET_STAGGER_MS,
} from "../features/schedule/interaction";
import { isRotating } from "../features/free-rotation/state";
import { detailMode } from "../features/settings/detail-mode";
import { colorMode } from "../features/settings/color-mode";
import { paletteId } from "../features/settings/palette";
import { animateMotion } from "../lib/motion";

/**
 * 時計の上に予定アイコンを描画するレイヤー。ClockFace を包む div の中に絶対配置で重ねる
 * (ClockFace SVG とは独立 SVG)。同じ viewBox (340x340) を使うので座標系が一致する。
 *
 * インタラクション:
 *  - 短押しで poyon、長押し 500ms で warning (右上に ✕ ボタン)、✕ タップで削除アニメ後にデータ削除
 *  - warning は外タップ or 3 秒経過でキャンセル
 *  - りせっと中 (resetWarning) は全アイコンが wobble + 各々に ✕ ボタンが出る。任意の予定 or ✕ タップで
 *    時刻順 50ms stagger でくるくる消える。外タップ or 3 秒で全体キャンセル
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
  /** リセット警告中の外タップキャンセル用透明 rect を描くか (既定 true)。
   *  merged β で前面 (active) レイヤーに使う場合だけ false にする: 透明 + pointer-events: all の rect が
   *  全 SVG を覆うので、後面 (dimmed back) レイヤーのアイコン/✕ タップを奪ってしまうため。
   *  非 merged (split) や merged β の後面では default true で OK (互いに重ならない or 自分が下層)。 */
  showResetCancelRect?: boolean;
}

const VIEW = 340;
const CENTER = VIEW / 2;

const ICON_RADIUS_KUWASHIKU = 84;
const ICON_RADIUS_SUKKIRI = 94;
/** monotone × badge は cardinal 数字 (12/3/6/9 と PM の 12/15/18/21) を内側に大きく配置する特別仕様で、
 *  通常半径ではアイコンと数字が radial に被る。アイコンを cardinal 内端より中心側へ寄せる。 */
const ICON_RADIUS_KUWASHIKU_MONOTONE_BADGE = 64;
const ICON_RADIUS_SUKKIRI_MONOTONE_BADGE = 72;
const ICON_SIZE_KUWASHIKU = 18;
const ICON_SIZE_SUKKIRI = 24;
/** font-size に対する白背景円の半径比 (em-box 外接円 √2/2 ≈ 0.707 より少し小さく抑える)。 */
const ICON_BG_RADIUS_RATIO = 0.70;

/** 矢印三角形 (白)。底辺の両端が白円周上にぴったり乗るよう sqrt(bgR² - baseHalf²) で算出。 */
const TRI_BASE_HALF = 1.5;
const TRI_HEIGHT = 2.5;

const LONG_PRESS_MS = 500;
/** タップ判定の追加バッファ (viewBox 単位)。子どもの指でも当てやすくする透明拡張領域。 */
const ICON_TOUCH_BUFFER = 16;
/** ✕ボタンのタップ判定半径。視認可能な赤円 (DELETE_BUTTON_RADIUS=7) より大きめに取る。 */
const DELETE_BUTTON_TOUCH_RADIUS = 26;

/** ポヨン3 (3 段の高速バウンス)。タップ + マッチ window 入り口の one-shot で共通使用。 */
const POYON3_DURATION_MS = 400;
const POYON3_KEYFRAMES: Keyframe[] = [
  { transform: "scale(1)",    offset: 0 },
  { transform: "scale(1.22)", offset: 0.13 },
  { transform: "scale(0.90)", offset: 0.26 },
  { transform: "scale(1.16)", offset: 0.43 },
  { transform: "scale(0.94)", offset: 0.56 },
  { transform: "scale(1.10)", offset: 0.74 },
  { transform: "scale(1)",    offset: 1 },
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

/** くるくる〜パッ (削除アニメ)。0..65% で 720° 回転、65..100% で +360° しながら scale/opacity を 0 へ。 */
const POOF_DURATION_MS = 900;
const POOF_KEYFRAMES: Keyframe[] = [
  { transform: "rotate(0deg) scale(1)", opacity: 1, offset: 0 },
  { transform: "rotate(720deg) scale(1)", opacity: 1, offset: 0.65 },
  { transform: "rotate(1080deg) scale(0)", opacity: 0, offset: 1 },
];

/** イヤヤン (削除拒否の身振り、暫定)。clock モードで長押しされた時に削除する代わりに発火。
 *  最終的には「イヤンッ！イヤンッ！」と顔を左右に振って避けるようなモーションにしたい (左右の奥行き
 *  回転 = rotateY と組み合わせて頭を振る感じ、2 周目はテンポ早め)。今は translateX のみで連続的に揺れて
 *  しまっており「イヤヤン」(1 回の揺れ) 止まり。 */
const SHAKE_NO_DURATION_MS = 600;
const SHAKE_NO_KEYFRAMES: Keyframe[] = [
  { transform: "translateX(0)",    offset: 0 },
  { transform: "translateX(-8px)", offset: 0.20 },  // 1 周目 左
  { transform: "translateX(8px)",  offset: 0.45 },  // 1 周目 右
  { transform: "translateX(0)",    offset: 0.55 },  // 1 周目終わり 一拍
  { transform: "translateX(-8px)", offset: 0.65 },  // 2 周目 左 (テンポ早い)
  { transform: "translateX(8px)",  offset: 0.80 },  // 2 周目 右
  { transform: "translateX(0)",    offset: 1 },
];

/** displayed - eventM の差を [-720, 720] に正規化 (0/1440 跨ぎ対応)。 */
const wrapMinuteDiff = (diff: number): number => {
  while (diff > 720) diff -= 1440;
  while (diff < -720) diff += 1440;
  return diff;
};

/** ポヨポヨアニメ用 window。通常 2 分前から、天頂 (AM 0:00 / PM 12:00) のみ 5 分前から (AM/PM 境目を強調)。 */
const MATCH_WINDOW_MINUTES_BEFORE = 2;
const MATCH_WINDOW_MINUTES_BEFORE_NOON = 5;
const isWithinMatchWindow = (displayed: number, eventM: number): boolean => {
  const diff = wrapMinuteDiff(displayed - eventM);
  const before = (eventM === 0 || eventM === 720)
    ? MATCH_WINDOW_MINUTES_BEFORE_NOON
    : MATCH_WINDOW_MINUTES_BEFORE;
  return diff >= -before && diff <= 0;
};

/** 「dim 側でもハッキリ見せる」用 window。ポヨポヨ window とは目的が違うので別概念で持つ
 *  (ポヨポヨ = アニメで気を引く / こちら = もうすぐ来る予告)。 */
const VISIBILITY_WINDOW_MINUTES_BEFORE = 2;
const isWithinVisibilityWindow = (displayed: number, eventM: number): boolean => {
  const diff = wrapMinuteDiff(displayed - eventM);
  return diff >= -VISIBILITY_WINDOW_MINUTES_BEFORE && diff <= 0;
};

const DELETE_BUTTON_OFFSET = 10;
const DELETE_BUTTON_RADIUS = 7;

const ScheduleLayer: Component<ScheduleLayerProps> = (props) => {
  const isKuwashiku = () => detailMode() === "kuwashiku";
  const isMonotoneBadge = () => colorMode() === "badge" && paletteId() === "monotone";
  const iconRadius = () => {
    if (isMonotoneBadge()) {
      return isKuwashiku() ? ICON_RADIUS_KUWASHIKU_MONOTONE_BADGE : ICON_RADIUS_SUKKIRI_MONOTONE_BADGE;
    }
    return isKuwashiku() ? ICON_RADIUS_KUWASHIKU : ICON_RADIUS_SUKKIRI;
  };
  const iconFontSize = () => isKuwashiku() ? ICON_SIZE_KUWASHIKU : ICON_SIZE_SUKKIRI;
  const iconBgRadius = () => iconFontSize() * ICON_BG_RADIUS_RATIO;

  /** 全予定の時刻を昇順で持つ配列。EventIcon が自分の chronologicalRank を引くのに使う。 */
  const sortedAllMinutes = createMemo(() => {
    return Object.keys(schedule()).map(Number).sort((a, b) => a - b);
  });

  /** この period に属する events を時刻降順で返す。降順にすることで SVG document order の末尾
   *  (= 最前面) に若い時刻が来て、同位置帯で重なった時に「早い時刻が手前」の stack 表示になる。 */
  const eventsForPeriod = createMemo<ScheduleEvent[]>(() => {
    const isPm = props.period === "pm";
    const result: ScheduleEvent[] = [];
    for (const [m, id] of Object.entries(schedule())) {
      const minutes = Number(m);
      if ((minutes >= 720) === isPm) {
        result.push({ minutes, iconId: id });
      }
    }
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

  /** warning/deleting 中のイベントがこのレイヤーに属するか (= ✕ボタンを出すか)。resetWarning /
   *  resetDeleting は両 period に属する。 */
  const activeInThisLayer = createMemo(() => {
    const i = interaction();
    if (i.type === "none") return null;
    if (i.type === "resetWarning" || i.type === "resetDeleting") return i;
    const isAm = i.minutes < 720;
    if ((props.period === "am" && isAm) || (props.period === "pm" && !isAm)) {
      return i;
    }
    return null;
  });

  /** 単発 warning の ✕ ボタン位置 (resetWarning の per-event ✕ は別経路で出す)。 */
  const deleteButtonPos = createMemo(() => {
    const a = activeInThisLayer();
    if (!a || a.type !== "warning") return null;
    const iconPos = positionOf(a.minutes);
    return { x: iconPos.x + DELETE_BUTTON_OFFSET, y: iconPos.y - DELETE_BUTTON_OFFSET };
  });

  /** event ごとの opacity 優先順:
   *    1. dimmed && !visible — dimOpacity (薄い側で予告外の予定)
   *    2. dimmed && visible  — 1.0 (薄い側でも「もうすぐ起きる予定」はハッキリ)
   *    3. !dimmed            — 1.0
   *  merged 表示中は親 wrapper opacity=0 で全体が隠れるので event 単位で隠す必要は無い。 */
  const eventOpacity = (visibleInDim: boolean): number => {
    if (visibleInDim || !props.dimmed) return 1;
    return props.dimOpacity ?? 0.25;
  };

  /** ばっじモードでは文字盤が白円なので白アイコンが浮く。シール感を出すため group シルエット
   *  (白円 + 三角ポインタ) に薄い drop-shadow を落とす。くぎりモードは色背景なので不要、
   *  monotone はミニマル基調なので影を入れない (cardinal 大文字盤化との相性も悪い)。 */
  const stickerShadow = () =>
    colorMode() === "badge" && paletteId() !== "monotone"
      ? "drop-shadow(0 1px 1.4px rgba(0,0,0,0.13))"
      : undefined;

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
        {/* りせっと中の外タップキャンセル用透明 rect。アイコンより前に置くことで「アイコンタップ→
            triggerResetDelete」「外タップ→cancelWarning」を両立 (アイコンが上に乗っているので
            アイコン領域は rect に届かない)。
            merged β で前面レイヤーは showResetCancelRect=false で抑制 (下層 dimmed back のタップを
            この透明 rect が奪うのを避ける、cancel rect は後面側 1 個だけで十分)。 */}
        <Show when={activeInThisLayer()?.type === "resetWarning" && (props.showResetCancelRect ?? true)}>
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

        <For each={eventsForPeriod()}>
          {(event) => (
            <EventIcon
              event={event}
              pos={positionOf(event.minutes)}
              triPoints={trianglePointsOf(event.minutes)}
              iconBgRadius={iconBgRadius()}
              iconFontSize={iconFontSize()}
              isMatched={isWithinMatchWindow(props.displayedMinutes, event.minutes)}
              chronologicalRank={sortedAllMinutes().indexOf(event.minutes)}
              opacity={eventOpacity(
                isWithinVisibilityWindow(props.displayedMinutes, event.minutes),
              )}
              dropShadow={stickerShadow()}
            />
          )}
        </For>

        {/* 単発 warning の外タップキャンセル用透明 rect。warning event がこのレイヤーに属する時のみ
            描画する (両レイヤーで描画すると merged β の dim 側予定の ✕ が上のレイヤーの cancel rect
            に覆われて押せなくなる)。アイコンより後に置くことでアイコンタップも cancel に倒す
            (= 単発 warning 中はアイコン本体タップでも cancel)。 */}
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

        <Show when={deleteButtonPos()}>
          {(pos) => (
            <DeleteButton
              cx={pos().x}
              cy={pos().y}
              onTrigger={() => {
                const a = activeInThisLayer();
                if (a && a.type === "warning") triggerDelete(a.minutes);
              }}
            />
          )}
        </Show>

        {/* りせっと中: 全 event に ✕ ボタンを出す。タップで triggerResetDelete (全消し)。 */}
        <Show when={activeInThisLayer()?.type === "resetWarning"}>
          <For each={eventsForPeriod()}>
            {(event) => {
              const iconPos = positionOf(event.minutes);
              return (
                <DeleteButton
                  cx={iconPos.x + DELETE_BUTTON_OFFSET}
                  cy={iconPos.y - DELETE_BUTTON_OFFSET}
                  onTrigger={triggerResetDelete}
                />
              );
            }}
          </For>
        </Show>
      </svg>
    </div>
  );
};

/** ✕ ボタン (赤円 + 白縁取り + ✕ 線)。タップ判定円を視認円より大きく取って子どもの指でも当てやすく。 */
const DeleteButton: Component<{
  cx: number;
  cy: number;
  onTrigger: () => void;
}> = (props) => {
  return (
    <g
      style={{ "pointer-events": "all", cursor: "pointer" }}
      onPointerDown={(e) => {
        e.stopPropagation();
        props.onTrigger();
      }}
    >
      <circle
        cx={props.cx}
        cy={props.cy}
        r={DELETE_BUTTON_TOUCH_RADIUS}
        fill="transparent"
        style={{ "pointer-events": "all" }}
      />
      <circle cx={props.cx} cy={props.cy} r={DELETE_BUTTON_RADIUS + 1} fill="#C01030" />
      <circle cx={props.cx} cy={props.cy} r={DELETE_BUTTON_RADIUS} fill="#FF4060" />
      <line
        x1={props.cx - DELETE_BUTTON_RADIUS * 0.45}
        y1={props.cy - DELETE_BUTTON_RADIUS * 0.45}
        x2={props.cx + DELETE_BUTTON_RADIUS * 0.45}
        y2={props.cy + DELETE_BUTTON_RADIUS * 0.45}
        stroke="#222222"
        stroke-width="2"
        stroke-linecap="round"
      />
      <line
        x1={props.cx - DELETE_BUTTON_RADIUS * 0.45}
        y1={props.cy + DELETE_BUTTON_RADIUS * 0.45}
        x2={props.cx + DELETE_BUTTON_RADIUS * 0.45}
        y2={props.cy - DELETE_BUTTON_RADIUS * 0.45}
        stroke="#222222"
        stroke-width="2"
        stroke-linecap="round"
      />
    </g>
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
  /** 全予定の中での時刻順位 (0 が最も早い)。りせっと削除時の poof アニメ stagger 算出に使う。 */
  chronologicalRank: number;
  /** ScheduleLayer が決めたこの event 単体の表示 opacity (0..1)。
   *  .fade-on-dim class で 380ms transition (親 .selection-dim-instant 中は 0ms)。 */
  opacity: number;
  /** CSS filter 文字列 (drop-shadow 等)。ばっじモードでシール感を出す用。undefined で影なし。 */
  dropShadow: string | undefined;
}

/** warning 中に ±4° の往復を継続させる wobble (ホワホワ) アニメ。resetDeleting 中も自分の poof が
 *  始まるまで wobble を続ける (poof 開始時に WAAPI の later-animation-wins で transform が乗っ取られる)。 */
const setupWobbleAnim = (
  groupRef: () => SVGGElement | undefined,
  isWobbling: () => boolean,
) => {
  let anim: Animation | null = null;
  createEffect(() => {
    const g = groupRef();
    if (!g) return;
    if (isWobbling()) {
      anim?.cancel();
      anim = animateMotion(
        g,
        [{ transform: "rotate(-4deg)" }, { transform: "rotate(4deg)" }],
        { duration: 180, iterations: Infinity, direction: "alternate", easing: "ease-in-out" },
      );
    } else {
      anim?.cancel();
      anim = null;
    }
  });
  onCleanup(() => anim?.cancel());
};

/** deleting 開始で 1 回だけ走るくるくる〜パッ (poof) アニメ。delayMs が指定されている場合は WAAPI の
 *  delay で開始タイミングをずらす (りせっと時の時刻順 stagger 用)。delay 中は wobble が見え続ける。 */
const setupPoofAnim = (
  groupRef: () => SVGGElement | undefined,
  isDeleting: () => boolean,
  delayMs: () => number,
) => {
  createEffect(on(isDeleting, (deleting) => {
    const g = groupRef();
    if (!g || !deleting) return;
    animateMotion(
      g,
      POOF_KEYFRAMES,
      { duration: POOF_DURATION_MS, easing: "linear", fill: "forwards", delay: delayMs() },
    );
  }));
};

/** マッチ window 入った瞬間に one-shot ポヨン3 を投入。自動回転で window が 50ms しか開かなくても
 *  自身の duration (400ms) を完走する。下の継続 loop より「先に」呼ばないと、後発の continuous が
 *  WAAPI composite で勝って one-shot が見えなくなる。defer なし: mount 時 isMatched=true (window
 *  内で表示開始) でも発火させたい。 */
const setupMatchEnterAnim = (
  groupRef: () => SVGGElement | undefined,
  isMatched: () => boolean,
  isWobbling: () => boolean,
  isDeleting: () => boolean,
) => {
  createEffect(on(isMatched, (matched) => {
    const g = groupRef();
    if (!g || !matched) return;
    if (isWobbling() || isDeleting()) return;
    animateMotion(g, POYON3_KEYFRAMES, { duration: POYON3_DURATION_MS, easing: "ease-out" });
  }));
};

/** マッチ中の continuous loop (1 周期 = バウンス前半 42% + rest 後半 58%)。warning/deleting 中は
 *  他アニメと干渉するので止める。 */
const setupMatchLoopAnim = (
  groupRef: () => SVGGElement | undefined,
  isMatched: () => boolean,
  isWobbling: () => boolean,
  isDeleting: () => boolean,
) => {
  let anim: Animation | null = null;
  createEffect(() => {
    const g = groupRef();
    if (!g) return;
    if (isWobbling() || isDeleting()) {
      anim?.cancel();
      anim = null;
      return;
    }
    if (isMatched()) {
      if (!anim) {
        anim = animateMotion(g, MATCH_LOOP_KEYFRAMES, {
          duration: MATCH_LOOP_DURATION_MS,
          iterations: Infinity,
          easing: "ease-out",
        });
      }
    } else {
      anim?.cancel();
      anim = null;
    }
  });
  onCleanup(() => anim?.cancel());
};

const EventIcon: Component<EventIconProps> = (props) => {
  let groupRef: SVGGElement | undefined;
  let pressTimer: ReturnType<typeof setTimeout> | undefined;
  let longPressed = false;

  const def = () => getScheduleIcon(props.event.iconId);

  /** wobble (ホワホワ) を出す状態。単発 warning (自分が対象) / りせっと中の resetWarning / resetDeleting
   *  (自分の poof が delay 後に走るまでは wobble を継続させる)。 */
  const isWobbling = createMemo(() => {
    const i = interaction();
    if (i.type === "warning" && i.minutes === props.event.minutes) return true;
    if (i.type === "resetWarning") return true;
    if (i.type === "resetDeleting") return true;
    return false;
  });

  const isDeleting = createMemo(() => {
    const i = interaction();
    if (i.type === "deleting" && i.minutes === props.event.minutes) return true;
    if (i.type === "resetDeleting") return true;
    return false;
  });

  /** りせっと削除中だけ自分の chronologicalRank に応じた delay を返す。単発 deleting は delay 0。 */
  const poofDelayMs = createMemo(() => {
    const i = interaction();
    if (i.type === "resetDeleting") return props.chronologicalRank * RESET_STAGGER_MS;
    return 0;
  });

  const refGetter = () => groupRef;
  const matchedGetter = () => props.isMatched;
  setupWobbleAnim(refGetter, isWobbling);
  setupPoofAnim(refGetter, isDeleting, poofDelayMs);
  setupMatchEnterAnim(refGetter, matchedGetter, isWobbling, isDeleting);
  setupMatchLoopAnim(refGetter, matchedGetter, isWobbling, isDeleting);

  const triggerPoyon3 = () => {
    if (!groupRef) return;
    animateMotion(groupRef, POYON3_KEYFRAMES, {
      duration: POYON3_DURATION_MS,
      easing: "ease-out",
    });
  };

  const triggerShakeNo = () => {
    if (!groupRef) return;
    animateMotion(groupRef, SHAKE_NO_KEYFRAMES, {
      duration: SHAKE_NO_DURATION_MS,
      easing: "ease-in-out",
    });
  };

  const onPointerDown = (e: PointerEvent) => {
    const i = interaction();
    // りせっと警告中は icon タップで全消し (rotation かどうか問わず先に処理)。
    if (i.type === "resetWarning") {
      e.stopPropagation();
      triggerResetDelete();
      return;
    }
    // 回転モード中は icon を素通しさせて container 側に渡す
    // (autoRotate→freeRotate 切替や drag を妨げないため)。長押し warning は container 側で検出して enter。
    // タップ poyon は出さない (auto-rotate を妨げる)。
    if (isRotating()) return;
    e.stopPropagation();
    // 別イベントが warning/deleting/resetDeleting 中は新規操作を受け付けない。
    if (i.type !== "none") return;
    longPressed = false;
    // clock モードでは削除不可。長押しで warning に入る代わりに「イヤヤン」と身を振って拒否する
    // (削除は freeRotate 中の container 経由のみ)。最終的には「イヤンッ！イヤンッ！」と顔を左右に振る
    // モーションにしたいが暫定。
    pressTimer = setTimeout(() => {
      longPressed = true;
      triggerShakeNo();
    }, LONG_PRESS_MS);
  };

  const onPointerUp = (e: PointerEvent) => {
    if (isRotating()) return; // 回転モード中は何もしない (pointerdown も素通しなのでタイマー無し)
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
  });

  return (
    <Show when={def()}>
      <g
        ref={(el) => {
          groupRef = el;
          // 回転モード中の長押し warning 検出を container 側で行うためのマーカー
          // (event.target.closest('[data-event-minutes]') で識別)。
          el.setAttribute("data-event-minutes", String(props.event.minutes));
        }}
        class="fade-on-dim"
        style={{
          // bbox 中心を transform 原点に → 回転/拡縮がアイコン中心まわりで起きる。
          "transform-box": "fill-box",
          "transform-origin": "center",
          "pointer-events": "auto",
          cursor: "pointer",
          opacity: props.opacity,
          filter: props.dropShadow,
        }}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
      >
        {/* 視認できる白円より大きい透明判定円。pointer-events: all で透明領域でもヒットさせる
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
