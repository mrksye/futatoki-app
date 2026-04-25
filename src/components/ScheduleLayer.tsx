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
  zIndex?: number;
  /** レイヤー全体のスケール (1 で等倍)。merged β 表示の後ろレイヤーで奥行きを出す用。 */
  scale?: number;
  /** レイヤー全体に直接かける opacity (= wrapper div の opacity)。
   *  merged β 表示の後ろレイヤーを薄くする等の用途。指定時は event-level の dimmed/mergedHidden より優先。 */
  opacity?: number;
  /** 親側が薄い側 (= 反対 period のプレビュー中、merged β の後ろレイヤー等) ならば true。
   *  window 外の event は dimOpacity に薄く、window 内の event は dim 無視で 1.0 に保つ。 */
  dimmed?: boolean;
  /** dimmed=true 時の event 薄さ (default 0.25)。merged β 後ろは 0.15 等で奥行きを強める。 */
  dimOpacity?: number;
  /** merge 表示中 (= 中央 1 つの時計、AM/PM 分割は隠す) ならば true。全 event を opacity 0 に。 */
  mergedHidden?: boolean;
  /** 現在表示中の時刻 (0..1439 の整数、分単位)。一致するイベントは continuous でポヨンポヨンする */
  displayedMinutes: number;
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
/** タップ判定領域: 視認可能な白円の外側に追加するバッファ (viewBox 単位)。
   子どもの指でも押しやすくするため、透明の円で touch 範囲を拡げる。 */
const ICON_TOUCH_BUFFER = 16;
/** ✕ボタンのタップ判定半径 (viewBox 単位)。視認可能な赤円 (TRASH_RADIUS=7) より大きめ。 */
const TRASH_TOUCH_RADIUS = 26;

/** ポヨン3 (3 段の高速バウンス): クリック時 + マッチ window 入り口の one-shot で共通 */
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

/**
 * マッチ中の continuous loop の 1 周期 (1500ms)。
 * 0..42% に「躍動感ある」バウンス (大きめ first + わずかな rotation で揺れる感)、
 * 42..100% は scale 1 で rest。iterations: Infinity で延々繰り返す。
 */
const MATCH_LOOP_DURATION_MS = 1500;
const MATCH_LOOP_KEYFRAMES: Keyframe[] = [
  { transform: "scale(1) rotate(0deg)",     offset: 0 },
  { transform: "scale(1.28) rotate(-3deg)", offset: 0.05 },  // 大きく速く up + 左に傾く
  { transform: "scale(0.85) rotate(3deg)",  offset: 0.12 },  // squash + 右に傾く
  { transform: "scale(0.88) rotate(2deg)",  offset: 0.18 },  // 一瞬の溜め
  { transform: "scale(1.18) rotate(-2deg)", offset: 0.28 },  // 2 段目
  { transform: "scale(0.94) rotate(0deg)",  offset: 0.36 },
  { transform: "scale(1) rotate(0deg)",     offset: 0.42 },  // 着地
  { transform: "scale(1) rotate(0deg)",     offset: 1 },     // rest
];

/** くるくる〜パッ: 0..65% は等速で 720° 回転 (見せ場)、65..100% で +360° 回転しながら縮小+フェード */
const POOF_DURATION_MS = 900;

/**
 * マッチ判定の窓: event 分の 2 分前から event 分まで (= 計 3 分間 isMatched=true)。
 * 自動回転 (60 分/秒) では 3 分 = 50ms しか窓が開かないので、入った瞬間に
 * 別途 one-shot ポヨン3 をトリガーして可視性を担保する (continuous loop だけだと描画が間に合わない)。
 */
/** displayed - eventM の差を [-720, 720] に正規化 (0/1440 跨ぎ対応)。 */
const wrapMinuteDiff = (diff: number): number => {
  while (diff > 720) diff -= 1440;
  while (diff < -720) diff += 1440;
  return diff;
};

/** ポヨポヨアニメ用 window (= EventIcon の isMatched 判定)。
 *  通常 2 分前から、ただし天頂位置 (AM 0:00 / PM 12:00) のみ 5 分前から (AM/PM 境目を強調)。
 *  撤去 (天頂特例だけ): MATCH_WINDOW_MINUTES_BEFORE_NOON の三項演算子を消して
 *  before を MATCH_WINDOW_MINUTES_BEFORE 固定に戻すだけ。 */
const MATCH_WINDOW_MINUTES_BEFORE = 2;
const MATCH_WINDOW_MINUTES_BEFORE_NOON = 5;
const isWithinMatchWindow = (displayed: number, eventM: number): boolean => {
  const diff = wrapMinuteDiff(displayed - eventM);
  const before = (eventM === 0 || eventM === 720)
    ? MATCH_WINDOW_MINUTES_BEFORE_NOON
    : MATCH_WINDOW_MINUTES_BEFORE;
  return diff >= -before && diff <= 0;
};

/** 「dim 側でもハッキリ見せる」用 window (= eventOpacity の判定)。
 *  ポヨポヨ window と分離してあるのは、目的が違うため:
 *    - ポヨポヨ = 発生直前の "アニメで気を引く" → 短く狭い (数分)
 *    - 見える   = "もうすぐ来る" の予告 → ポヨポヨより広く取れる
 *  特例: お昼休み相当の 12:00〜12:59 (= 720..779 分、正午台 1 時間) の予定だけは 59 分前から
 *  表示し、「もうすぐお昼」を分かりやすく予告する。撤去はこの三項演算子を消して固定値に戻すだけ。 */
const VISIBILITY_WINDOW_MINUTES_BEFORE = 2;
const VISIBILITY_WINDOW_MINUTES_BEFORE_LUNCH_BAND = 59;
const isWithinVisibilityWindow = (displayed: number, eventM: number): boolean => {
  const diff = wrapMinuteDiff(displayed - eventM);
  const before = (eventM >= 720 && eventM <= 779)
    ? VISIBILITY_WINDOW_MINUTES_BEFORE_LUNCH_BAND
    : VISIBILITY_WINDOW_MINUTES_BEFORE;
  return diff >= -before && diff <= 0;
};

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

  // event ごとの opacity 決定。引数の visibleInDim は "dim 側でもハッキリ見せたいか" の判定結果
  // (= isWithinVisibilityWindow)。ポヨポヨ window とは別概念で広めに取られている。
  //   mergedHidden       → 全部 0 (merge transition 中で分割表示を隠す)
  //   dimmed && !visible → dimOpacity (薄い側で予告外の予定)
  //   dimmed && visible  → 1.0 (薄い側でも "もうすぐ起きる予定" はハッキリ見せる)
  //   !dimmed            → 1.0 (アクティブ側は全 event 通常表示)
  const eventOpacity = (visibleInDim: boolean): number => {
    if (props.mergedHidden) return 0;
    if (visibleInDim || !props.dimmed) return 1;
    return props.dimOpacity ?? 0.25;
  };

  return (
    <div
      class="absolute inset-0 flex items-center justify-center pointer-events-none"
      style={{
        opacity: props.opacity,
        "z-index": props.zIndex,
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
              opacity={eventOpacity(isWithinVisibilityWindow(props.displayedMinutes, event.minutes))}
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
              {/* 透明のタップ判定円: 視認できる赤円より大きい。EventIcon と同じ理由 */}
              <circle
                cx={pos().x}
                cy={pos().y}
                r={TRASH_TOUCH_RADIUS}
                fill="transparent"
                style={{ "pointer-events": "all" }}
              />
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
  /** 現在の displayed time がこのイベント時刻と一致しているか (連続ポヨンポヨン用) */
  isMatched: boolean;
  /** ScheduleLayer が決めたこの event 単体の表示 opacity (0..1)。
   *  .fade-on-dim class で 380ms transition される (親 .opacity-instant 中は 0ms)。 */
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

  // ホワホワ (wobble): warning 中は ±4° の往復アニメを継続
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

  // くるくる〜パッ (poof): deleting 開始で 1 回だけ走らせる
  // 0..65%: 等速で 720° 回転 (2周分の見せ場、scale/opacity 変化なし)
  // 65..100%: +360° (合計 1080°) しながら scale 1→0 + opacity 1→0
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

  // ポヨン3 (高速 3 段バウンス): タップ時の即時フィードバック。
  // マッチ window 入り口でも同じ keyframes を one-shot で投入する (下の effect 参照)。
  const triggerPoyon3 = () => {
    if (!groupRef) return;
    animateMotion(groupRef, POYON3_KEYFRAMES, {
      duration: POYON3_DURATION_MS,
      easing: "ease-out",
    });
  };

  // マッチ window 入った瞬間に one-shot ポヨン3 を投入。
  // 自動回転で window が 50ms しか開かなくても、このアニメは自分の duration (400ms) を完走する。
  // 後の continuous loop が (composite "replace" で) 一瞬上書きするが、
  // window 抜けて continuous が cancel されると one-shot の transform が再び見えるので可視。
  // 注: この effect を continuous loop effect より「先に定義」しておくこと。
  //     後発 (continuous) の方が WAAPI composite で勝ち、stopped 状態で continuous の方が見える。
  // defer なし: mount 直後に既に isMatched=true の場合 (= window 内で表示開始) も
  // ポヨン3 を発火させたいため。matched=false で start しても matched 内の早期 return で
  // 何も起きないので副作用は無い。
  createEffect(on(
    () => props.isMatched,
    (matched) => {
      if (!groupRef || !matched) return;
      if (isWarning() || isDeleting()) return;
      triggerPoyon3();
    },
  ));

  // マッチ中の continuous: 1 周期 = 躍動感バウンス (前半 42%) + rest (後半 58%)。延々ループ。
  // warning/deleting 中は走らせない (他のアニメと干渉するため)。
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
          // bbox 中心を transform 原点にすることで、回転/拡縮がアイコン中心まわりで起きる
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
        {/* 透明のタップ判定円: 視認できる白円より大きく、子どもの指でも当てやすくする。
            最初に置くことで pointer event は受けるが、視覚的には後から重なる白円/絵文字/三角の下になる。
            pointer-events: all で透明領域でもヒットする (デフォルト visiblePainted は alpha 0 でヒットしない) */}
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
