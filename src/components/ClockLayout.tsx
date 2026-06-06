import { createEffect, createMemo, createSignal, lazy, on, onCleanup, onMount, Show, Suspense } from "solid-js";
import type { Component, ParentComponent } from "solid-js";
import ClockFace from "./clockface-layers/ClockFace";
import HandsLayer from "./clockface-layers/HandsLayer";
import ActivityLayer from "./clockface-layers/ActivityLayer";
import ActivityPicker from "./ActivityPicker";
import LanguagePicker from "./LanguagePicker";
import ModePicker from "./ModePicker";
import RotationActions from "./RotationActions";
import SecondsBar from "./SecondsBar";
import SettingsPopover from "./SettingsPopover";
import SkyBackground from "./SkyBackground";
// timer 機能 (Web Audio + 音源参照を含む) は重いので lazy 分割し main バンドルから外す。
// 分割された chunk/音源は vite-plugin-pwa の precache 対象なのでオフラインでも動く。
const TimerLayout = lazy(() => import("./TimerLayout"));
const TimerActions = lazy(() => import("./TimerActions"));
import { useCurrentTime } from "../hooks/useCurrentTime";
import { useOrientation } from "../hooks/useOrientation";
import { useViewport } from "../hooks/useViewport";
import { useSafeAreaInsets } from "../hooks/useSafeAreaInsets";
import {
  paletteMaxBtnWidth,
  paletteMaxBtnHeight,
  computeMaxClockSize,
} from "../features/layout/palette-clearance";
import { clockMode, isRotating, isTimerMode, rotateMinutes, seekRotate, transition } from "../features/free-rotation/state";
import { useAutoRotateTick } from "../features/free-rotation/auto-rotate";
import { useIdleExitTimer } from "../features/free-rotation/idle-exit";
import {
  useMergeAnimation,
  useMergeImpactWobble,
  amTransform,
  pmTransform,
  mergedTransform,
} from "../features/free-rotation/merge-animation";
import {
  useTimerTransition,
  timerTransitioning,
  timerTransitionPhase,
  timerTransitionKind,
  clockTreeMounted,
  timerTreeMounted,
  clockTreeShowsClocks,
  clockShowsMergedAtLeft,
  timerWrappersActive,
  timerPmConvergingLeft,
  timerMergedAtLeft,
  timerMergedRevealed,
  timerMergedTransform,
  timerPmWrapperTransform,
  playEmergeFromBehindLeft,
  playMergedSlideToCenter,
  playMergedSlideFromCenter,
} from "../features/timer/timer-transition";
import { useAmPmFlip } from "../features/am-pm-flip";
import { computeVisibleMinutes, useReleaseSnap } from "../features/free-rotation/release-snap";
import { useI18n } from "../i18n";
import { dragStart, dragAdvance, type DragDragState } from "../features/free-rotation/drag";
import { wheelAdvance, newWheelVelocityState, resetWheelVelocity } from "../features/free-rotation/wheel";
import { resistTrigger, notifyResistance } from "../features/free-rotation/resistance";
import { interaction, enterWarning, cancelWarning } from "../features/activity/interaction";
import { playTapSheen, playShakeNo } from "../lib/motion";

/** 時計面長押し (= 削除拒否の「イヤイヤ」発火) の閾値。EventIcon の LONG_PRESS_MS と意図的に揃える
 *  (1 つの ms 感覚を全 long-press UI で共有)。 */
const CLOCK_FACE_LONG_PRESS_MS = 500;
/** 時計面 shake の左右振幅。EventIcon の default 8px より小さく抑える: clock 面 (~600px) は大面積なので
 *  同 amplitude だと首振りでなく「全体がガクッと寄る」見え方になる。3〜6px で「小さく速く首を振る」
 *  感が出る。 */
const CLOCK_FACE_SHAKE_AMPLITUDE_PX = 5;

/** freeRotate 中の長押し warning 検出パラメータ。clock モードの EventIcon が持つ LONG_PRESS_MS と
 *  揃える。 */
const ROTATION_LONG_PRESS_MS = 500;
/** pointerdown 起点からこの距離を超えて動いたら「静止長押し」でなく実ドラッグと確定する閾値。確定後は
 *  反対側 split 盤を unmount してよくなり、静止前提の長押し warning は取り消す。 */
const ROTATION_DRAG_CONFIRM_THRESHOLD_PX = 8;

type DragState = DragDragState;

/**
 * dim 用 absolute オーバーレイ。
 *
 * pointer-events-none は構造的に必須: ActivityLayer の上に absolute inset-0 で乗るため、
 * デフォルトの auto のままだとできごとアイコンへの pointer がこの空 box で止まる。
 */
const DimOverlay: ParentComponent<{ opacity: number }> = (props) => (
  <div
    class="absolute inset-0 fade-on-dim pointer-events-none"
    style={{ opacity: props.opacity }}
  >
    {props.children}
  </div>
);

/**
 * AM/PM 半盤の中央に置く正方形コンテナ。中の ClockFace / ActivityLayer / HandsLayer (いずれも
 * absolute inset-0) はこの slot を containing block として位置取りするので、slot のサイズを
 * 制限すれば 3 layer まとめて縮む (= 時計中心は変わらず半径だけ縮む)。
 *
 * floating な palette ボタンが時計と被る locale で時計の最大寸法を制限する用途。size の決定は
 * features/layout/palette-clearance の computeMaxClockSize を参照。
 *
 * 時計モード (= !isRotating) のインタラクション。EventIcon の反応機構と同型:
 *  - pointerdown: 500ms 長押しタイマー始動 (sheen はここで発火させない)。
 *  - 長押し 500ms 経過: イヤイヤと首を振る (SHAKE_NO, amplitude 5px / 600ms)。longPressed フラグ
 *    が立ち、続く pointerup での sheen は抑止される (削除不可を伝えた後に「タップ確認」が出ると変)。
 *  - pointerup (短タップ): 一筋の白帯がサッと過ぎ去る (TAP_SHEEN, 420ms)。
 * できごとアイコンの pointerdown は ActivityLayer 側で clock モード時 stopPropagation してるのでここには
 * 上がってこず、icon と slot の反応は独立。
 */
const ClockSlot: ParentComponent<{ size: number }> = (props) => {
  let ref: HTMLDivElement | undefined;
  let pressTimer: ReturnType<typeof setTimeout> | undefined;
  let longPressed = false;

  const cancelPress = () => {
    if (pressTimer) {
      clearTimeout(pressTimer);
      pressTimer = undefined;
    }
  };

  const onPointerDown = () => {
    if (isRotating()) return;
    cancelPress();
    longPressed = false;
    pressTimer = setTimeout(() => {
      pressTimer = undefined;
      longPressed = true;
      if (ref) playShakeNo(ref, CLOCK_FACE_SHAKE_AMPLITUDE_PX);
    }, CLOCK_FACE_LONG_PRESS_MS);
  };

  const onPointerUp = () => {
    if (isRotating()) return;
    cancelPress();
    if (!longPressed && ref) playTapSheen(ref);
  };

  onCleanup(cancelPress);

  return (
    <div
      ref={(el) => (ref = el)}
      class="relative"
      style={{
        width: `${props.size}px`,
        height: `${props.size}px`,
      }}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onPointerCancel={cancelPress}
    >
      {props.children}
    </div>
  );
};

/** floating な palette ボタンの基準内側 margin (CSS の `right-2` / `bottom-2` = 0.5rem = 8px)。
 *  iOS PWA では env(safe-area-inset-*) のほうが大きい場合がある (landscape 下端 ~21px 等) ので、
 *  実際の edgeMargin は max(BASE, safeArea) で都度計算する。 */
const PALETTE_BTN_BASE_EDGE_MARGIN_PX = 8;
/** ボタン rect と clock circle の最低視覚 clearance。0 にすると edge が touch するので少し空ける。 */
const PALETTE_BTN_SAFETY_GAP_PX = 4;

export const ClockLayout: Component = () => {
  const time = useCurrentTime();
  const isLandscape = useOrientation();
  const viewport = useViewport();
  const safeArea = useSafeAreaInsets();
  const { t } = useI18n();

  /** 各 AM/PM 半盤の clock SVG が取れる最大寸法 (diameter)。floating palette ボタンと交差しない
   *  最大円を幾何的に求める。isRotating 中 / たいむ (遷移含む) 中は palette ボタンが消える (たいむは
   *  popover 内) ので natural 最大に戻す。特にたいむ遷移中は clock ツリーと TimerLayout の盤を同一サイズで
   *  受け渡す必要があり、palette clearance で縮めると合体盤が大きく見えて位置がズレる。
   *  (computeMaxClockSize は palette wid/hei が 0 で natural を返す挙動も持つが、palette signal は前回値を
   *  保持しているので明示的に分岐が必要)。 */
  const maxClockSize = createMemo(() => {
    const w = viewport.width();
    const h = viewport.height();
    const land = isLandscape();
    const halfW = land ? w / 2 : w;
    const halfH = land ? h : h / 2;
    const naturalSize = Math.min(halfW, halfH);
    if (isRotating() || isTimerMode() || timerTransitioning()) return naturalSize;
    // landscape の palette は bottom-center, portrait は right-center に floating する。
    // ボタンと viewport 端の実距離は CSS の var(--safe-edge-*) と一致 = max(BASE, safeArea)。
    const sa = safeArea();
    const edgeMargin = Math.max(
      PALETTE_BTN_BASE_EDGE_MARGIN_PX,
      land ? sa.bottom : sa.right,
    );
    return computeMaxClockSize(
      w,
      h,
      land,
      paletteMaxBtnWidth(),
      paletteMaxBtnHeight(),
      edgeMargin,
      PALETTE_BTN_SAFETY_GAP_PX,
    );
  });

  /** drag / autoRotate 中は rotateMinutes が連続的に動く状態。release-snap の snap 抑制と
   *  display の float-vs-ceil 切替に使う。 */
  const [dragging, setDragging] = createSignal(false);
  const moving = createMemo(() => dragging() || clockMode() === "autoRotate");
  /** 実ドラッグが確定したか (pointerdown から閾値を超えて動いた)。静止長押し中は false のまま。
   *  反対側 split 盤の unmount (合成負荷軽減) はこの確定後だけに限定し、長押し中は薄い側の盤も残す。 */
  const [dragConfirmed, setDragConfirmed] = createSignal(false);

  const displayed = createMemo(() => {
    if (isRotating()) {
      const m = rotateMinutes();
      const v = computeVisibleMinutes(m, moving());
      const wrapped = ((v % 1440) + 1440) % 1440;
      return { hours: Math.floor(wrapped / 60), minutes: wrapped % 60, seconds: 0 };
    }
    return time();
  });

  /** event match 用に整数分へ snap (自由回転中は rotateMinutes が小数になり得るため)。 */
  const displayedMinutesTotal = createMemo(() => {
    const d = displayed();
    return ((d.hours * 60 + Math.round(d.minutes)) % 1440 + 1440) % 1440;
  });

  /** 実時刻の分が切り替わるたび increment するカウンタ。HandsLayer 側で WAAPI 軽 wobble の発火に使う。
   *  rotation 中は minute prop が連続的に変わるが、本シグナルは time() 由来なので rotation の影響を受けない。
   *  rotation 中の発火は抑止 (回転中は分針 wobble が物理的に意味を持たないため)。
   *  prev === undefined の早期 return は初回 mount 時の callback 発火を捨てる用。defer: true でも
   *  Solid の `on` は最初の callback 呼び出し時 prev に undefined を渡す仕様なので、これがないと
   *  ロード直後に 1 回必ず揺れる。 */
  const [minuteTickKey, setMinuteTickKey] = createSignal(0);
  createEffect(on(() => time().minutes, (curr, prev) => {
    if (prev === undefined) return;
    if (curr === prev) return;
    if (isRotating()) return;
    setMinuteTickKey(k => k + 1);
  }));

  /** drag 終了 / autoRotate 停止時に rotateMinutes の小数部を整数分に収束させる。
   *  逆回転禁止のため、frac < 0.5 では snap せず float のまま、frac ≥ 0.5 では ceil で前方に揃える。
   *  詳細は release-snap.ts。 */
  const { flushPendingCommit } = useReleaseSnap({
    moving,
    fireMotion: () => setMinuteTickKey(k => k + 1),
  });

  const actualIsAm = createMemo(() => displayed().hours < 12);
  const { isAm, startPress, cancelPress } = useAmPmFlip(actualIsAm);
  /** AM/PM を長押しトグルで実時刻と逆側に flip している間 true。.selection-dim-instant 経由で
   *  flip 成立=即時切替, 解除=380ms フェード (詳細は index.css)。 */
  const amPmFlipped = createMemo(() => isAm() !== actualIsAm());

  const amTime = createMemo(() => ({
    hours: displayed().hours % 12,
    minutes: displayed().minutes,
  }));

  const pmTime = createMemo(() => ({
    hours: displayed().hours % 12,
    minutes: displayed().minutes,
  }));

  let containerRef: HTMLDivElement | undefined;
  let amWrapperRef: HTMLDivElement | undefined;
  let pmWrapperRef: HTMLDivElement | undefined;
  /** 高頻度 pointermove で書き換わるため signal にせず直接 mutate して allocation を抑える。 */
  let dragRef: DragState | null = null;
  /** pointerdown 起点の座標。実ドラッグ確定判定 (confirmDragOnMove) に使う。 */
  let pressOriginX = 0;
  let pressOriginY = 0;
  let pendingMinutes: number | null = null;
  let rafId: number | null = null;

  const commitPending = () => {
    rafId = null;
    if (pendingMinutes !== null) {
      seekRotate(pendingMinutes);
      pendingMinutes = null;
    }
  };

  const queueSeek = (m: number) => {
    pendingMinutes = m;
    if (rafId === null) rafId = requestAnimationFrame(commitPending);
  };

  /** freeRotate 中、pointerdown ができごとアイコン上で起きた時の長押し warning 検出 state。container が
   *  pointer をキャプチャすると icon は pointerup を受け取れないので、icon でなく container 側でタイマーを
   *  持つ。movement による取り消しは実ドラッグ確定 (confirmDragOnMove) に相乗りする。clock モードの長押し
   *  (EventIcon 内) とは独立した経路。 */
  let longPressTimer: ReturnType<typeof setTimeout> | undefined;
  let longPressIconMinutes: number | null = null;

  const findIconMinutesFromTarget = (target: EventTarget | null): number | null => {
    if (!(target instanceof Element)) return null;
    const node = target.closest("[data-event-minutes]");
    if (!node) return null;
    const v = node.getAttribute("data-event-minutes");
    return v === null ? null : Number(v);
  };

  const startLongPressWarning = (e: PointerEvent) => {
    cancelLongPressWarning();
    if (interaction().type !== "none") return;
    const minutes = findIconMinutesFromTarget(e.target);
    if (minutes === null) return;
    longPressIconMinutes = minutes;
    longPressTimer = setTimeout(() => {
      longPressTimer = undefined;
      const m = longPressIconMinutes;
      longPressIconMinutes = null;
      if (m === null) return;
      if (interaction().type !== "none") return;
      enterWarning(m);
    }, ROTATION_LONG_PRESS_MS);
  };

  /** pointer が pressOrigin から閾値を超えて動いたら実ドラッグと確定する。確定で反対側 split 盤の unmount を
   *  許可し (dragConfirmed)、静止前提の長押し warning も取り消す。閾値内に留まる長押し中は dragConfirmed が
   *  false のまま = 薄い側の盤も見えたまま残る。 */
  const confirmDragOnMove = (e: PointerEvent) => {
    if (dragConfirmed()) return;
    const dx = e.clientX - pressOriginX;
    const dy = e.clientY - pressOriginY;
    if (Math.hypot(dx, dy) <= ROTATION_DRAG_CONFIRM_THRESHOLD_PX) return;
    setDragConfirmed(true);
    cancelLongPressWarning();
  };

  const cancelLongPressWarning = () => {
    if (longPressTimer) {
      clearTimeout(longPressTimer);
      longPressTimer = undefined;
    }
    longPressIconMinutes = null;
  };

  const onDragStart = (e: PointerEvent) => {
    if (!isRotating()) return;
    // warning / resetWarning 中の周辺タップは drag や autoRotate 切替より先にキャンセルを優先。
    // (ActivityLayer の透明 rect は SVG 領域だけ覆ってるので、地の余白タップはここで拾う)。
    const it = interaction().type;
    if (it === "warning" || it === "resetWarning") {
      cancelWarning();
      return;
    }
    // autoRotate 中の背景タップは freeRotate へ切替て停止 (左下「すとっぷ」と同等の操作)。
    if (clockMode() === "autoRotate") {
      transition("freeRotate");
      return;
    }
    // 直前 release で release-snap の commit が pending だった場合は先に flush。これを
    // やらないと dragStart が float の startMinutes を capture してしまい、commit が後から
    // 書き戻されて drag 中に逆回転が混じる。
    flushPendingCommit();
    pressOriginX = e.clientX;
    pressOriginY = e.clientY;
    setDragConfirmed(false);
    // pointer ができごとアイコン上で押された場合の長押し warning 検出を仕込む
    // (drag と並行: 閾値を超えて動いたら drag 確定で warning は出さない、500ms 静止なら warning に入る)。
    startLongPressWarning(e);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragRef = dragStart(e, rotateMinutes());
    setDragging(true);
  };

  const onDragMove = (e: PointerEvent) => {
    const s = dragRef;
    if (!s || e.pointerId !== s.pointerId) return;
    // ガードの後に置くのが必須: clock モードでは onDragStart が early return して dragRef も
    // pressOrigin も更新しないため、ここを前に置くと clock モードの pointermove が古い pressOrigin
    // との距離で dragConfirmed を誤って latch し、反対側の盤が永久に消える。
    confirmDragOnMove(e);
    queueSeek(dragAdvance(e, s));
  };

  const onDragEnd = (e: PointerEvent) => {
    cancelLongPressWarning();
    const s = dragRef;
    if (!s || e.pointerId !== s.pointerId) return;
    const el = e.currentTarget as HTMLElement;
    if (el.hasPointerCapture?.(e.pointerId)) el.releasePointerCapture(e.pointerId);
    dragRef = null;
    setDragging(false);
    setDragConfirmed(false);
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
    if (pendingMinutes !== null) {
      seekRotate(pendingMinutes);
      pendingMinutes = null;
    }
  };

  onCleanup(() => {
    if (rafId !== null) cancelAnimationFrame(rafId);
    cancelLongPressWarning();
  });

  let wheelTarget: number | null = null;
  /** session 内の累積 float (snap 前)。session idle まで保持して連続 wheel の小数累積を続けて取る。 */
  let wheelTargetFloat: number | null = null;
  let wheelTweenStartTime = 0;
  let wheelTweenStartMinutes = 0;
  let wheelTweenRaf: number | null = null;
  let wheelSessionIdleTimer: ReturnType<typeof setTimeout> | undefined;
  /** 速度ブースト用の state。session idle で reset して次 session を 0 から立ち上げる。 */
  const wheelVelocityState = newWheelVelocityState();
  const WHEEL_TWEEN_DURATION_MS = 220;
  const WHEEL_SESSION_IDLE_MS = 600;

  const tickWheelTween = () => {
    if (wheelTarget === null) {
      wheelTweenRaf = null;
      return;
    }
    const now = performance.now();
    const t = Math.min(1, (now - wheelTweenStartTime) / WHEEL_TWEEN_DURATION_MS);
    const eased = 1 - (1 - t) * (1 - t); // ease-out quad
    const m = wheelTweenStartMinutes + (wheelTarget - wheelTweenStartMinutes) * eased;
    seekRotate(m);
    if (t >= 1) {
      wheelTarget = null;
      wheelTweenRaf = null;
      return;
    }
    wheelTweenRaf = requestAnimationFrame(tickWheelTween);
  };

  const startWheelTween = (target: number) => {
    wheelTarget = target;
    wheelTweenStartTime = performance.now();
    wheelTweenStartMinutes = rotateMinutes();
    if (wheelTweenRaf === null) {
      wheelTweenRaf = requestAnimationFrame(tickWheelTween);
    }
  };

  /** ホイール event ハンドラ。SolidJS の onWheel JSX は passive listener として登録されて
   *  preventDefault が効かないため自前 addEventListener("wheel", ..., { passive: false }) で
   *  attach する (page scroll を抑制する用)。止まる位置を整数分に揃えるため float 累積を Math.round で
   *  snap し、tween で滑らかに動かす。
   *
   *  listener は window 直付け。containerRef だけに付けると merged (かさね) モードで
   *  mergedInnerRef (pointer-events: auto) が wheel を吸い、bubble は mergedContainerRef
   *  までしか上がらん (両者は containerRef とは sibling) ので reach できない。window で受けてから
   *  target が clock 領域 (containerRef または mergedContainerRef 内) かを check し、popover や
   *  language picker 内の wheel は target check で skip させる。 */
  const onWheel = (e: WheelEvent) => {
    if (clockMode() !== "freeRotate") return;
    if (dragging()) return;
    const target = e.target as Node | null;
    if (!target) return;
    const inClock =
      (containerRef && containerRef.contains(target)) ||
      (mergedContainerRef && mergedContainerRef.contains(target));
    if (!inClock) return;
    e.preventDefault();
    const result = wheelAdvance(e, wheelVelocityState);
    if (result.kind === "ignore") return;
    if (result.kind === "resist") {
      notifyResistance();
      return;
    }
    if (wheelTargetFloat === null) {
      wheelTargetFloat = rotateMinutes();
    }
    wheelTargetFloat += result.minutesDelta;
    const snapped = Math.round(wheelTargetFloat);
    if (snapped !== wheelTarget) {
      startWheelTween(snapped);
    }
    if (wheelSessionIdleTimer) clearTimeout(wheelSessionIdleTimer);
    wheelSessionIdleTimer = setTimeout(() => {
      wheelTargetFloat = null;
      resetWheelVelocity(wheelVelocityState);
    }, WHEEL_SESSION_IDLE_MS);
  };

  onMount(() => {
    window.addEventListener("wheel", onWheel, { passive: false });
  });
  onCleanup(() => {
    window.removeEventListener("wheel", onWheel);
    if (wheelTweenRaf !== null) cancelAnimationFrame(wheelTweenRaf);
    if (wheelSessionIdleTimer) clearTimeout(wheelSessionIdleTimer);
  });

  const { mergedVisible, transitioning, mergedRevealed } = useMergeAnimation();
  let mergedContainerRef: HTMLDivElement | undefined;
  let mergedInnerRef: HTMLDivElement | undefined;
  let mergedPressTimer: ReturnType<typeof setTimeout> | undefined;
  let mergedLongPressed = false;
  useMergeImpactWobble(() => mergedContainerRef, mergedRevealed);

  // たいむモードへの出入りトランジションのフェーズ送りを仕込む (回転の合体機構とは別軸)。phase は
  // timer-transition の module-level signal なので TimerLayout 側も同じものを読む。
  useTimerTransition();

  // 入り収束 (enterConverge) / 出り発散 (exitDiverge) の merged 盤 WAAPI スライド。
  //   - 入り centerSlide (回転→たいむ): merged を C→L へスライド (中央かさね → たいむ L 着地)。
  //   - 出り centerSlide (たいむ→回転): merged を L→C へスライド (たいむ L → 中央かさね)。
  //   - 出り splitSide (たいむ→とけい): PM 盤が L 盤の裏から R へ「びよッ」と生み出される。
  // 入り splitSide (とけい→たいむ) の PM 収束と timer盤の retreat (exitBoing) は別経路 (CSS / TimerLayout)。
  // CSS transition では回転からの reflow で baseline を奪われ盤がスナップするので merged スライドは WAAPI で明示。
  // fill 付き WAAPI は前回分を必ず cancel + onCleanup で解放 (timeline 蓄積による弱 GPU の drop を防ぐ)。
  let transitionSlideAnimation: Animation | null = null;
  const cancelTransitionSlide = () => {
    transitionSlideAnimation?.cancel();
    transitionSlideAnimation = null;
  };
  createEffect(
    on(timerTransitionPhase, (phase, prev) => {
      if (prev === undefined || phase === prev) return;
      cancelTransitionSlide();
      if (phase === "enterConverge" && timerTransitionKind() === "centerSlide") {
        if (mergedContainerRef) {
          transitionSlideAnimation = playMergedSlideFromCenter(mergedContainerRef, isLandscape());
        }
      } else if (phase === "exitDiverge") {
        if (timerTransitionKind() === "centerSlide") {
          if (mergedContainerRef) transitionSlideAnimation = playMergedSlideToCenter(mergedContainerRef, isLandscape());
        } else if (pmWrapperRef) {
          // merged を L で見せる「ためし」は exitBoing 末尾で済むので、ここ (exitDiverge) では即 emerge。
          transitionSlideAnimation = playEmergeFromBehindLeft(pmWrapperRef, isLandscape());
        }
      }
    }),
  );
  onCleanup(cancelTransitionSlide);

  /** わける/かさねる 切替中 (transitioning) は body に slot-transitioning を付与し、index.css の
   *  `body.slot-transitioning .slot-crossfade` rule で slot-crossfade ボタン (できごと追加 / 1ふん
   *  戻す / AM/PM バッジ) を slot-dim animation で 560ms 中央谷型に薄くする (移動するボタンに
   *  視線が引かれるのを抑え、時計の合体アニメに集中させる UX 設計)。 */
  createEffect(() => {
    document.body.classList.toggle("slot-transitioning", transitioning());
  });
  onCleanup(() => document.body.classList.remove("slot-transitioning"));

  const cancelMergedPress = () => {
    if (mergedPressTimer) {
      clearTimeout(mergedPressTimer);
      mergedPressTimer = undefined;
    }
  };
  onCleanup(cancelMergedPress);

  /** かさね β の中身インタラクション。反応機構は ClockSlot / EventIcon と同型 (pointerdown でタイマー、
   *  500ms で shake + longPressed=true、pointerup で gate 越えたら sheen)。split AM/PM とは別 ref のため
   *  timer / フラグを独立に持つ。 */
  const onMergedClockPointerDown = () => {
    if (isRotating()) return;
    cancelMergedPress();
    mergedLongPressed = false;
    mergedPressTimer = setTimeout(() => {
      mergedPressTimer = undefined;
      mergedLongPressed = true;
      if (mergedInnerRef) playShakeNo(mergedInnerRef, CLOCK_FACE_SHAKE_AMPLITUDE_PX);
    }, CLOCK_FACE_LONG_PRESS_MS);
  };

  const onMergedClockPointerUp = () => {
    if (isRotating()) return;
    cancelMergedPress();
    if (!mergedLongPressed && mergedInnerRef) playTapSheen(mergedInnerRef);
  };
  useAutoRotateTick();
  useIdleExitTimer();

  /** AM 側 selection dim opacity (アクティブ=1, 薄い側=0.3)。
   *
   *  dim opacity は 2 軸構造:
   *    - merge dim (mergedVisible? 0 : 1): wrapper inline opacity で 380ms smooth fade
   *    - selection dim (これ): 内側 DimOverlay の .fade-on-dim、.selection-dim-instant 中だけ 0ms
   *  この分離で merge 切替時の transitioning timing race を構造的に防ぐ。 */
  const amSelectionOpacity = createMemo(() => isAm() ? 1 : 0.3);
  /** PM 側 selection dim opacity (詳細は amSelectionOpacity の JSDoc 参照)。 */
  const pmSelectionOpacity = createMemo(() => isAm() ? 0.3 : 1);

  /** wrapper への .selection-dim-instant 付与条件 (= 子の .fade-on-dim を 0ms 即時切替に上書き):
   *    1. AM/PM 長押しトグルで flip 中 (flip 成立=即時, 解除=380ms フェード)
   *    2. 自由回転 split 中で merge transition 外 → 自動回転 / drag / wheel で 12:00 を跨ぐ瞬間の
   *       selection 切替がパッと
   *  merge transition 中 (transitioning) は smooth fade を維持。 */
  const selectionDimInstant = createMemo(
    () => amPmFlipped() || (isRotating() && !transitioning()),
  );

  /** AM/PM 各 wrapper の表示条件: merged 中 (transitioning 以外) は隠す。実ドラッグ進行中 (pointer 押下中
   *  かつ閾値を超えて移動済み) は反対側を unmount して合成負荷を軽減する。判定に dragging を必ず併せるので、
   *  pointer を離す / clock モードでは dragConfirmed の値に関係なく両側表示へ戻る (静止長押し中も薄い側は
   *  残る)。たいむ遷移中は split wrapper が動くフェーズ (splitSide の収束/発散) だけ出す
   *  (centerSlide や boing 中は merged 盤だけ / TimerLayout 側が描く)。 */
  const amSplitVisible = createMemo(() =>
    timerTransitioning()
      ? timerWrappersActive()
      : (!mergedVisible() || transitioning()) && (isAm() || !(dragging() && dragConfirmed())),
  );
  const pmSplitVisible = createMemo(() =>
    timerTransitioning()
      ? timerWrappersActive()
      : (!mergedVisible() || transitioning()) && (!isAm() || !(dragging() && dragConfirmed())),
  );

  /** AM/PM バッジを出すのは「とけい」静止時だけ。回転中・たいむ中はもちろん、たいむ遷移中も隠す。
   *  入室 (回転/とけい→たいむ) では切替ボタン押下と同時に isTimerMode が立つので即座に消える (enterConverge
   *  での一瞬の見え隠れ防止)。退室 (たいむ→とけい) では timerTransitioning が落ちる = 分離アニメ完了で
   *  idle 復帰した瞬間にだけ出す (分離途中で先走って現れるのを防ぐ。slot-crossfade の 100ms フェードで滑り込む)。 */
  const amPmBadgeVisible = createMemo(
    () => !isRotating() && !isTimerMode() && !timerTransitioning(),
  );

  /** SkyBackground の mount/unmount は (gradient div 1 枚でも) DOM 挿入の強制 reflow が、同フレームに走る
   *  AM/PM wrapper の合体/分離 transform transition の baseline を奪い、wrapper が中央へ寄らず最終位置へ
   *  スナップさせる。そこで mount/unmount を transition のフレームからずらす:
   *    - 入室 (回転モードへ): mount を double rAF で遅らせ、wrapper の合体 transition を先に発火させる。
   *    - 退室 (clock へ): 分離 transition が終わる (transitioning が落ちる) まで保持してから unmount。
   *  double rAF は paint を確実に 1 回挟むための保険 (merge-animation の mergedRevealed と同型)。
   *  mount 後の重い子要素 (星 30 個 / 太陽月) の生成スパイクは SkyBackground 側で段階表示に分散する。 */
  const [skyVisible, setSkyVisible] = createSignal(isRotating());
  let skyRaf1: number | null = null;
  let skyRaf2: number | null = null;
  const cancelSkyRaf = () => {
    if (skyRaf1 !== null) { cancelAnimationFrame(skyRaf1); skyRaf1 = null; }
    if (skyRaf2 !== null) { cancelAnimationFrame(skyRaf2); skyRaf2 = null; }
  };
  createEffect(on([isRotating, transitioning, timerTransitioning], () => {
    // たいむ遷移中 (出入り) は sky を必ず畳む。SkyBackground は clock ツリー側 = DOM 上 TimerLayout より
    // 後ろ = 重ね順で上にあり、出ていると timer 盤の生み出し/去り際アニメ (z-auto) を覆って隠す。
    // 入室 (回転→たいむ) では sky が出たままだと産み出し盤を覆うので、保持ではなく unmount する。
    // 遷移中の timer アニメは全て WAAPI なのでこの unmount の reflow では死なない。遷移完了
    // (timerTransitioning が false) で再評価され、isRotating に応じて出し直す。
    if (timerTransitioning()) {
      cancelSkyRaf();
      setSkyVisible(false);
      return;
    }
    if (isRotating()) {
      if (!skyVisible() && skyRaf1 === null) {
        skyRaf1 = requestAnimationFrame(() => {
          skyRaf1 = null;
          skyRaf2 = requestAnimationFrame(() => { skyRaf2 = null; setSkyVisible(true); });
        });
      }
    } else if (!transitioning()) {
      cancelSkyRaf();
      setSkyVisible(false);
    }
    // 退室 transition 中 (回転 false / transitioning true) は保持して何もしない。
  }));
  onCleanup(cancelSkyRaf);

  return (
    <div class="w-full h-full overflow-hidden relative">
      {/* timer モードは別レイアウト (両盤面を濃く表示する合体時計 2 個)。clock / 回転モードの
          表示ツリー (下の Show) とは排他で、TimerLayout は ClockLayout の回転 machinery を一切知らない。
          ModePicker 等の floating controls は外に出して両モードで共有する。 */}
      <Show when={timerTreeMounted()}>
        <Suspense>
          <TimerLayout />
        </Suspense>
      </Show>

      <Show when={clockTreeMounted()}>
        <Show when={skyVisible()}>
          <SkyBackground totalMinutes={rotateMinutes()} />
        </Show>

        {/* 時計そのもの (split wrapper / merged 盤 / 秒バー / バッジ)。たいむ中は unmount せず display:none で
            隠す (重い盤 SVG を毎サイクル作り直さず使い回す = 生成/破棄とラスタ再生成の churn を断つ)。遷移の
            boing フェーズ中は TimerLayout が L 盤を引き継ぐのでここも display:none。背景はこの外側。
            display:contents は wrapper 自身の box を消し、子の absolute 配置を root 基準のまま保つ。 */}
        {/* 時計ジオメトリは dir 非依存 (=常に LTR) でピン留めする。時計は右回りという物理に
            紐づくので、AM 盤は左 / PM 盤は右が朝→夜の clockwise 進行と一致する。RTL でも
            盤面・数字をミラーしないのと同じ理由で、半盤の左右順 (flex-row の主軸) も読み方向で
            入れ替えてはいけない。chrome (ModePicker/Settings/RotationActions 隅) は root 側で
            dir=rtl を継承したままミラーさせる ので、ピンはこの clock subtree に閉じる。 */}
        <div dir="ltr" style={{ display: clockTreeShowsClocks() ? "contents" : "none" }}>
        <div
          ref={containerRef}
          class={"absolute inset-0 flex items-stretch " + (isLandscape() ? "flex-row" : "flex-col")}
          style={{
            "touch-action": clockMode() === "freeRotate" ? "none" : "auto",
            cursor:
              clockMode() === "freeRotate"
                ? (dragging() ? "grabbing" : "grab")
                : "default",
          }}
          onPointerDown={onDragStart}
          onPointerMove={onDragMove}
          onPointerUp={onDragEnd}
          onPointerCancel={onDragEnd}
        >
          {/* 負マージンで中央へオーバーラップ → 盤面サイズを保ちつつ四隅にボタン余白を作る。
              AM wrapper を z-10 にすることでかさね/わけ transition の overlap 中に AM (表) が PM (裏) の
              手前に来る。DOM 順だけだと後ろの PM が手前になり、表/裏が逆転する。 */}
          <div
            ref={amWrapperRef}
            class="clock-wrapper-transition relative z-10 flex-1 flex flex-col items-center justify-center min-h-0 min-w-0"
            classList={{
              "-mr-3": isLandscape(),
              "-mb-3": !isLandscape(),
              "selection-dim-instant": selectionDimInstant(),
              "merge-hidden": mergedVisible(),
            }}
            style={{
              transform: amTransform(mergedVisible(), isLandscape()),
              "will-change": transitioning() || timerTransitioning() ? "transform" : "auto",
            }}
          >
            <Show when={amSplitVisible()}>
              <ClockSlot size={maxClockSize()}>
                <DimOverlay opacity={amSelectionOpacity()}>
                  <ClockFace period="am" hours={amTime().hours} />
                </DimOverlay>
                {/* ActivityLayer は dim 階層の外。merge transition 中 / autoRotate 中は外す
                    (620ms 合成負荷 / autoRotate の高速回転による合成負荷を回避)。 */}
                <Show when={!transitioning() && !timerTransitioning() && clockMode() !== "autoRotate"}>
                  <ActivityLayer
                    period="am"
                    dimmed={!isAm()}
                    displayedMinutes={displayedMinutesTotal()}
                  />
                </Show>
                {/* document order が後ろ → できごとアイコンの上に乗る */}
                <DimOverlay opacity={amSelectionOpacity()}>
                  <HandsLayer hours={amTime().hours} minutes={amTime().minutes} shakeKey={resistTrigger} minuteTickKey={minuteTickKey} />
                </DimOverlay>
              </ClockSlot>
            </Show>
          </div>

          <div
            ref={pmWrapperRef}
            class="clock-wrapper-transition relative flex-1 flex flex-col items-center justify-center min-h-0 min-w-0"
            classList={{
              "-ml-3": isLandscape(),
              "-mt-3": !isLandscape(),
              "selection-dim-instant": selectionDimInstant(),
              // 収束 (L へ寄る) では merge-hidden を付けて合体方向 easing (ease-in-out, overshoot なし) にする。
              // retain で wrapper は常駐なので born-hidden は起きない。バウンス easing だと左へ行き過ぎる。
              "merge-hidden": mergedVisible() || timerPmConvergingLeft(),
            }}
            style={{
              transform: timerPmConvergingLeft()
                ? timerPmWrapperTransform(isLandscape())
                : pmTransform(mergedVisible(), isLandscape()),
              "will-change": transitioning() || timerTransitioning() ? "transform" : "auto",
            }}
          >
            <Show when={pmSplitVisible()}>
              <ClockSlot size={maxClockSize()}>
                <DimOverlay opacity={pmSelectionOpacity()}>
                  <ClockFace period="pm" hours={pmTime().hours} />
                </DimOverlay>
                <Show when={!transitioning() && !timerTransitioning() && clockMode() !== "autoRotate"}>
                  <ActivityLayer
                    period="pm"
                    dimmed={isAm()}
                    displayedMinutes={displayedMinutesTotal()}
                  />
                </Show>
                <DimOverlay opacity={pmSelectionOpacity()}>
                  <HandsLayer hours={pmTime().hours} minutes={pmTime().minutes} shakeKey={resistTrigger} minuteTickKey={minuteTickKey} />
                </DimOverlay>
              </ClockSlot>
            </Show>
          </div>
        </div>

        {/* かさねモード container。clockMode 遷移時も滑らかに消えるよう、見えうる間
            (mergedVisible || transitioning) は DOM に保持する。
            opacity / transform は mergedRevealed 経由 (false→true 時に 1 frame 遅延 → fresh mount でも
            CSS transition が発火する。詳細は merge-animation.ts)。 */}
        <Show when={mergedVisible() || transitioning() || clockShowsMergedAtLeft()}>
          {/* pointer-events-none のままでも子 (icon 等) からの bubble は handler に届くので、merged β
              内の icon ドラッグも autoRotate→freeRotate / drag に拾える。touch-action は icon 等の祖先を辿る
              ので、ここに none を置かないと browser が touch を panning に取られる (containerRef は
              別 subtree なので touch-action が継承されない)。 */}
          <div
            ref={mergedContainerRef}
            class="clock-merged-container-transition absolute inset-0 z-20 flex items-center justify-center pointer-events-none"
            classList={{
              "flex-row": isLandscape(),
              "flex-col": !isLandscape(),
              "merge-revealed": clockShowsMergedAtLeft() ? timerMergedRevealed() : mergedRevealed(),
            }}
            style={{
              transform: clockShowsMergedAtLeft()
                ? timerMergedTransform(timerMergedAtLeft(), timerMergedRevealed(), isLandscape())
                : mergedTransform(mergedRevealed()),
              "transform-origin": "center",
              "will-change": transitioning() || timerTransitioning() ? "transform, opacity" : "auto",
              "touch-action": clockMode() === "freeRotate" ? "none" : "auto",
            }}
            onPointerDown={onDragStart}
            onPointerMove={onDragMove}
            onPointerUp={onDragEnd}
            onPointerCancel={onDragEnd}
          >
            <div
              ref={(el) => (mergedInnerRef = el)}
              class={
                "relative flex items-center justify-center " +
                (isLandscape() ? "w-1/2 h-full" : "w-full h-1/2")
              }
              style={{
                "pointer-events": "auto",
              }}
              onPointerDown={() => { if (!timerTransitioning()) onMergedClockPointerDown(); }}
              onPointerUp={() => { if (!timerTransitioning()) onMergedClockPointerUp(); }}
              onPointerCancel={cancelMergedPress}
            >
              <ClockFace period="merged" hours={displayed().hours} />
              {/* 重ね表示: 現在 period を前 + 不透明、反対側を dimOpacity=0.15 で後ろに重ねる。
                  z-index は使わない (正の z は z-auto の HandsLayer を覆う)。
                  merge transition 中 / autoRotate 中は二重描画コスト回避で外す。 */}
              <Show when={!transitioning() && !timerTransitioning() && clockMode() !== "autoRotate"}>
                <Show
                  when={displayed().hours < 12}
                  fallback={<>
                    <ActivityLayer period="am" dimmed dimOpacity={0.15} scale={0.85}
                      displayedMinutes={displayedMinutesTotal()} />
                    <ActivityLayer period="pm" showResetCancelRect={false}
                      displayedMinutes={displayedMinutesTotal()} />
                  </>}
                >
                  <ActivityLayer period="pm" dimmed dimOpacity={0.15} scale={0.85}
                    displayedMinutes={displayedMinutesTotal()} />
                  <ActivityLayer period="am" showResetCancelRect={false}
                    displayedMinutes={displayedMinutesTotal()} />
                </Show>
              </Show>
              {/* document order が最後 = z-auto 最前面 → できごとアイコンの上に乗る */}
              <HandsLayer hours={displayed().hours} minutes={displayed().minutes} shakeKey={resistTrigger} minuteTickKey={minuteTickKey} />
            </div>
          </div>
        </Show>

        <Show when={!isRotating()}>
          <div class="absolute top-0 left-0 right-0 z-10 pointer-events-none print:hidden">
            <SecondsBar seconds={displayed().seconds} hours={displayed().hours} />
          </div>
        </Show>

        {/* AM/PM バッジ。とけい/かいてん 切替で freeRotate 側のできごと追加ボタンとスロット位置を
            共有し、560ms の bouncy 位置 transition でスライドしつつ、overshoot 折返し付近
            (280-380ms) で 100ms の短いクロスフェードでできごと追加ボタンと入れ替わる。always-mount で
            opacity 0/1 を切り替えることで View Transitions API を使わず CSS 完結。 */}
        <div
          class={
            "absolute z-20 px-2.5 py-1 tablet:px-6 tablet:py-4 rounded-full text-base tablet:text-xl font-black shadow-md cursor-pointer slot-crossfade " +
            (isLandscape()
              ? (mergedVisible()
                  ? "left-[82%] top-[var(--safe-edge-top)] -translate-x-1/2"
                  : "left-1/2 top-[var(--safe-edge-top)] -translate-x-1/2")
              : (mergedVisible()
                  ? "left-[var(--safe-edge-left)] top-[80%] -translate-y-1/2"
                  : "left-[var(--safe-edge-left)] top-1/2 -translate-y-1/2"))
          }
          style={{
            "background-color": isAm() ? "#0080D8" : "#E02068",
            color: "#ffffff",
            "touch-action": "none",
            opacity: amPmBadgeVisible() ? 1 : 0,
            "pointer-events": amPmBadgeVisible() ? "auto" : "none",
          }}
          onPointerDown={startPress}
          onPointerUp={cancelPress}
          onPointerLeave={cancelPress}
          onPointerCancel={cancelPress}
        >
          {isAm() ? t("badge.am") : t("badge.pm")}
        </div>
        </div>
      </Show>

      <ModePicker />

      <SettingsPopover />

      <RotationActions />

      <Show when={isTimerMode()}>
        <Suspense>
          <TimerActions />
        </Suspense>
      </Show>

      <ActivityPicker />

      <LanguagePicker />
    </div>
  );
};
