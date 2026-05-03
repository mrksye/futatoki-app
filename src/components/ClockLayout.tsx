import { createEffect, createMemo, createSignal, on, onCleanup, onMount, Show } from "solid-js";
import type { Component, ParentComponent } from "solid-js";
import ClockFace from "./ClockFace";
import HandsLayer from "./HandsLayer";
import ScheduleLayer from "./ScheduleLayer";
import SchedulePicker from "./SchedulePicker";
import SecondsBar from "./SecondsBar";
import SettingsPanel from "./SettingsPanel";
import SkyBackground from "./SkyBackground";
import { useCurrentTime } from "../hooks/useCurrentTime";
import { useOrientation } from "../hooks/useOrientation";
import { useViewport } from "../hooks/useViewport";
import {
  paletteMaxBtnWidth,
  paletteMaxBtnHeight,
  computeMaxClockSize,
} from "../features/layout/palette-clearance";
import { clockMode, isRotating, rotateMinutes, seekRotate, transition } from "../features/free-rotation/state";
import { useAutoRotateTick } from "../features/free-rotation/auto-rotate";
import { useIdleExitTimer } from "../features/free-rotation/idle-exit";
import {
  useMergeAnimation,
  amTransform,
  pmTransform,
  mergedTransform,
  splitShadow,
} from "../features/free-rotation/merge-animation";
import { useAmPmPreviewHold } from "../features/debug/am-pm-preview-lock";
import { computeVisibleMinutes, useReleaseSnap } from "../features/free-rotation/release-snap";
import { MORPHING_SLOT } from "../features/view-transition";
import { useI18n } from "../i18n";
import { dragStart, dragAdvance, type DragDragState } from "../features/free-rotation/drag";
import { wheelAdvance, newWheelVelocityState, resetWheelVelocity } from "../features/free-rotation/wheel";
import { resistTrigger, notifyResistance } from "../features/free-rotation/resistance";
import { interaction, enterWarning, cancelWarning } from "../features/schedule/interaction";

/** freeRotate 中の長押し warning 検出パラメータ。clock モードの EventIcon が持つ LONG_PRESS_MS と
 *  揃える。 */
const ROTATION_LONG_PRESS_MS = 500;
/** 起点から MOVE_THRESHOLD_PX を超えたら drag とみなして warning は出さない。 */
const ROTATION_LONG_PRESS_MOVE_THRESHOLD_PX = 8;

type DragState = DragDragState;

/**
 * dim 用 absolute オーバーレイ。
 *
 * pointer-events-none は構造的に必須: ScheduleLayer の上に absolute inset-0 で乗るため、
 * デフォルトの auto のままだと予定アイコンへの pointer がこの空 box で止まる。
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
 * AM/PM 半盤の中央に置く正方形コンテナ。中の ClockFace / ScheduleLayer / HandsLayer (いずれも
 * absolute inset-0) はこの slot を containing block として位置取りするので、slot のサイズを
 * 制限すれば 3 layer まとめて縮む (= 時計中心は変わらず半径だけ縮む)。
 *
 * floating な palette ボタンが時計と被る locale で時計の最大寸法を制限する用途。size の決定は
 * features/layout/palette-clearance の computeMaxClockSize を参照。
 */
const ClockSlot: ParentComponent<{ size: number }> = (props) => (
  <div
    class="relative"
    style={{
      width: `${props.size}px`,
      height: `${props.size}px`,
    }}
  >
    {props.children}
  </div>
);

/** floating な palette ボタンの内側 margin (CSS の `right-2` / `bottom-2` = 0.5rem = 8px)。 */
const PALETTE_BTN_EDGE_MARGIN_PX = 8;
/** ボタン rect と clock circle の最低視覚 clearance。0 にすると edge が touch するので少し空ける。 */
const PALETTE_BTN_SAFETY_GAP_PX = 4;

export const ClockLayout: Component = () => {
  const time = useCurrentTime();
  const isLandscape = useOrientation();
  const viewport = useViewport();
  const { t } = useI18n();

  /** 各 AM/PM 半盤の clock SVG が取れる最大寸法 (diameter)。floating palette ボタンと交差しない
   *  最大円を幾何的に求める。isRotating 中は palette ボタンが消えるので natural 最大に戻る
   *  (computeMaxClockSize は palette wid/hei が 0 で natural を返す挙動も持つが、isRotating でも
   *  palette signal は前回値を保持しているので明示的に分岐が必要)。 */
  const maxClockSize = createMemo(() => {
    const w = viewport.width();
    const h = viewport.height();
    const land = isLandscape();
    const halfW = land ? w / 2 : w;
    const halfH = land ? h : h / 2;
    const naturalSize = Math.min(halfW, halfH);
    if (isRotating()) return naturalSize;
    return computeMaxClockSize(
      w,
      h,
      land,
      paletteMaxBtnWidth(),
      paletteMaxBtnHeight(),
      PALETTE_BTN_EDGE_MARGIN_PX,
      PALETTE_BTN_SAFETY_GAP_PX,
    );
  });

  /** drag / autoRotate 中は rotateMinutes が連続的に動く状態。release-snap の snap 抑制と
   *  display の float-vs-ceil 切替に使う。 */
  const [dragging, setDragging] = createSignal(false);
  const moving = createMemo(() => dragging() || clockMode() === "autoRotate");

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
  const { isAm, startHold, clearHold } = useAmPmPreviewHold(actualIsAm);
  /** AM/PM プレビュー長押しで反対側を表示している間 true。.selection-dim-instant 経由で
   *  押下=即時切替, 離す=380ms フェード (詳細は index.css)。 */
  const previewFlipped = createMemo(() => isAm() !== actualIsAm());

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
  let pendingMinutes: number | null = null;
  let rafId: number | null = null;

  const commitPending = () => {
    rafId = null;
    if (pendingMinutes !== null) {
      seekRotate(pendingMinutes);
      pendingMinutes = null;
    }
  };

  const schedule = (m: number) => {
    pendingMinutes = m;
    if (rafId === null) rafId = requestAnimationFrame(commitPending);
  };

  /** freeRotate 中、pointerdown が予定アイコン上で起きた時の長押し warning 検出 state。container が
   *  pointer をキャプチャすると icon は pointerup を受け取れないので、icon でなく container 側で
   *  タイマーと movement 判定を持つ。clock モードの長押し (EventIcon 内) とは独立した経路。 */
  let longPressTimer: ReturnType<typeof setTimeout> | undefined;
  let longPressStartX = 0;
  let longPressStartY = 0;
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
    longPressStartX = e.clientX;
    longPressStartY = e.clientY;
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

  const checkLongPressWarningMove = (e: PointerEvent) => {
    if (!longPressTimer) return;
    const dx = e.clientX - longPressStartX;
    const dy = e.clientY - longPressStartY;
    if (Math.hypot(dx, dy) > ROTATION_LONG_PRESS_MOVE_THRESHOLD_PX) {
      cancelLongPressWarning();
    }
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
    // (ScheduleLayer の透明 rect は SVG 領域だけ覆ってるので、地の余白タップはここで拾う)。
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
    // pointer が予定アイコン上で押された場合の長押し warning 検出を仕込む
    // (drag と並行: 8px 動いたら drag 確定で warning は出さない、500ms 静止なら warning に入る)。
    startLongPressWarning(e);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragRef = dragStart(e, rotateMinutes());
    setDragging(true);
  };

  const onDragMove = (e: PointerEvent) => {
    checkLongPressWarningMove(e);
    const s = dragRef;
    if (!s || e.pointerId !== s.pointerId) return;
    schedule(dragAdvance(e, s));
  };

  const onDragEnd = (e: PointerEvent) => {
    cancelLongPressWarning();
    const s = dragRef;
    if (!s || e.pointerId !== s.pointerId) return;
    const el = e.currentTarget as HTMLElement;
    if (el.hasPointerCapture?.(e.pointerId)) el.releasePointerCapture(e.pointerId);
    dragRef = null;
    setDragging(false);
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
   *  preventDefault が効かないため、onMount で自前 addEventListener("wheel", ..., { passive: false }) で
   *  attach する (page scroll を抑制する用)。止まる位置を整数分に揃えるため float 累積を Math.round で
   *  snap し、tween で滑らかに動かす。 */
  const onWheel = (e: WheelEvent) => {
    if (clockMode() !== "freeRotate") return;
    if (dragging()) return;
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
    if (containerRef) {
      containerRef.addEventListener("wheel", onWheel, { passive: false });
    }
  });
  onCleanup(() => {
    if (containerRef) {
      containerRef.removeEventListener("wheel", onWheel);
    }
    if (wheelTweenRaf !== null) cancelAnimationFrame(wheelTweenRaf);
    if (wheelSessionIdleTimer) clearTimeout(wheelSessionIdleTimer);
  });

  const { mergedVisible, transitioning, mergedRevealed } = useMergeAnimation();
  useAutoRotateTick();
  useIdleExitTimer();

  /** AM 側 selection dim opacity (アクティブ=1, 薄い側=0.25)。
   *
   *  dim opacity は 2 軸構造:
   *    - merge dim (mergedVisible? 0 : 1): wrapper inline opacity で 380ms smooth fade
   *    - selection dim (これ): 内側 DimOverlay の .fade-on-dim、.selection-dim-instant 中だけ 0ms
   *  この分離で merge 切替時の transitioning timing race を構造的に防ぐ。 */
  const amSelectionOpacity = createMemo(() => isAm() ? 1 : 0.25);
  /** PM 側 selection dim opacity (詳細は amSelectionOpacity の JSDoc 参照)。 */
  const pmSelectionOpacity = createMemo(() => isAm() ? 0.25 : 1);

  /** wrapper への .selection-dim-instant 付与条件 (= 子の .fade-on-dim を 0ms 即時切替に上書き):
   *    1. AM/PM プレビュー長押し中 (押下=即時, 離す=380ms フェード)
   *    2. 自由回転 split 中で merge transition 外 → 自動回転 / drag / wheel で 12:00 を跨ぐ瞬間の
   *       selection 切替がパッと
   *  merge transition 中 (transitioning) は smooth fade を維持。 */
  const selectionDimInstant = createMemo(
    () => previewFlipped() || (isRotating() && !transitioning()),
  );

  /** AM/PM 各 wrapper の表示条件: merged 中 (transitioning 以外) は隠す。drag 中は反対側を unmount
   *  して合成負荷を軽減する。 */
  const amSplitVisible = createMemo(() => (!mergedVisible() || transitioning()) && (isAm() || !dragging()));
  const pmSplitVisible = createMemo(() => (!mergedVisible() || transitioning()) && (!isAm() || !dragging()));

  return (
    <div class="w-full h-full overflow-hidden relative">
      <Show when={isRotating()}>
        <SkyBackground totalMinutes={rotateMinutes()} />
      </Show>

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
        {/* 負マージンで中央へオーバーラップ → 盤面サイズを保ちつつ四隅にボタン余白を作る */}
        <div
          ref={amWrapperRef}
          class={
            "clock-wrapper-transition relative flex-1 flex flex-col items-center justify-center min-h-0 min-w-0 " +
            (isLandscape() ? "-mr-3" : "-mb-3")
          }
          classList={{ "selection-dim-instant": selectionDimInstant() }}
          style={{
            transform: amTransform(mergedVisible(), isLandscape()),
            opacity: mergedVisible() ? 0 : 1,
            filter: splitShadow(transitioning()),
            "will-change": transitioning() ? "transform, opacity" : "auto",
          }}
        >
          <Show when={amSplitVisible()}>
            <ClockSlot size={maxClockSize()}>
              <DimOverlay opacity={amSelectionOpacity()}>
                <ClockFace period="am" hours={amTime().hours} />
              </DimOverlay>
              {/* ScheduleLayer は dim 階層の外。merge transition 中 / autoRotate 中は外す
                  (620ms 合成負荷 / autoRotate の高速回転による合成負荷を回避)。 */}
              <Show when={!transitioning() && clockMode() !== "autoRotate"}>
                <ScheduleLayer
                  period="am"
                  dimmed={!isAm()}
                  displayedMinutes={displayedMinutesTotal()}
                />
              </Show>
              {/* document order が後ろ → 予定アイコンの上に乗る */}
              <DimOverlay opacity={amSelectionOpacity()}>
                <HandsLayer hours={amTime().hours} minutes={amTime().minutes} shakeKey={resistTrigger} minuteTickKey={minuteTickKey} />
              </DimOverlay>
            </ClockSlot>
          </Show>
        </div>

        <div
          ref={pmWrapperRef}
          class={
            "clock-wrapper-transition relative flex-1 flex flex-col items-center justify-center min-h-0 min-w-0 " +
            (isLandscape() ? "-ml-3" : "-mt-3")
          }
          classList={{ "selection-dim-instant": selectionDimInstant() }}
          style={{
            transform: pmTransform(mergedVisible(), isLandscape()),
            opacity: mergedVisible() ? 0 : 1,
            filter: splitShadow(transitioning()),
            "will-change": transitioning() ? "transform, opacity" : "auto",
          }}
        >
          <Show when={pmSplitVisible()}>
            <ClockSlot size={maxClockSize()}>
              <DimOverlay opacity={pmSelectionOpacity()}>
                <ClockFace period="pm" hours={pmTime().hours} />
              </DimOverlay>
              <Show when={!transitioning() && clockMode() !== "autoRotate"}>
                <ScheduleLayer
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
      <Show when={mergedVisible() || transitioning()}>
        {/* pointer-events-none のままでも子 (icon 等) からの bubble は handler に届くので、merged β
            内の icon ドラッグも autoRotate→freeRotate / drag に拾える。touch-action は icon 等の祖先を辿る
            ので、ここに none を置かないと browser が touch を panning に取られる (containerRef は
            別 subtree なので touch-action が継承されない)。 */}
        <div
          class={
            "clock-merged-container-transition absolute inset-0 flex items-center justify-center pointer-events-none " +
            (isLandscape() ? "flex-row" : "flex-col")
          }
          style={{
            opacity: mergedRevealed() ? 1 : 0,
            transform: mergedTransform(mergedRevealed()),
            "transform-origin": "center",
            filter: splitShadow(transitioning()),
            "will-change": transitioning() ? "transform, opacity" : "auto",
            "touch-action": clockMode() === "freeRotate" ? "none" : "auto",
          }}
          onPointerDown={onDragStart}
          onPointerMove={onDragMove}
          onPointerUp={onDragEnd}
          onPointerCancel={onDragEnd}
        >
          <div
            class={
              "relative flex items-center justify-center " +
              (isLandscape() ? "w-1/2 h-full" : "w-full h-1/2")
            }
          >
            <ClockFace period="merged" hours={displayed().hours} />
            {/* 重ね表示: 現在 period を前 + 不透明、反対側を dimOpacity=0.15 で後ろに重ねる。
                z-index は使わない (正の z は z-auto の HandsLayer を覆う)。
                merge transition 中 / autoRotate 中は二重描画コスト回避で外す。 */}
            <Show when={!transitioning() && clockMode() !== "autoRotate"}>
              <Show
                when={displayed().hours < 12}
                fallback={<>
                  <ScheduleLayer period="am" dimmed dimOpacity={0.15} scale={0.85}
                    displayedMinutes={displayedMinutesTotal()} />
                  <ScheduleLayer period="pm" showResetCancelRect={false}
                    displayedMinutes={displayedMinutesTotal()} />
                </>}
              >
                <ScheduleLayer period="pm" dimmed dimOpacity={0.15} scale={0.85}
                  displayedMinutes={displayedMinutesTotal()} />
                <ScheduleLayer period="am" showResetCancelRect={false}
                  displayedMinutes={displayedMinutesTotal()} />
              </Show>
            </Show>
            {/* document order が最後 = z-auto 最前面 → 予定アイコンの上に乗る */}
            <HandsLayer hours={displayed().hours} minutes={displayed().minutes} shakeKey={resistTrigger} minuteTickKey={minuteTickKey} />
          </div>
        </div>
      </Show>

      <Show when={!isRotating()}>
        <div class="absolute top-0 left-0 right-0 z-10 pointer-events-none">
          <SecondsBar seconds={displayed().seconds} hours={displayed().hours} />
        </div>
      </Show>

      {/* AM/PM バッジ。MORPHING_SLOT.LEFT を freeRotate の予定ボタンと共有してモード遷移時に
          ブラウザがモーフィング描画する (slot 一覧は features/view-transition.ts)。 */}
      <Show when={!isRotating()}>
        <div
          class={
            "absolute z-20 px-2.5 py-1 tablet:px-6 tablet:py-4 rounded-full text-base tablet:text-xl font-black shadow-md cursor-pointer " +
            (isLandscape()
              ? "left-1/2 top-2 -translate-x-1/2"
              : "left-2 top-1/2 -translate-y-1/2")
          }
          style={{
            "background-color": isAm() ? "#0080D8" : "#E02068",
            color: "#ffffff",
            "touch-action": "none",
            "view-transition-name": MORPHING_SLOT.LEFT,
          }}
          onPointerDown={startHold}
          onPointerUp={clearHold}
          onPointerLeave={clearHold}
          onPointerCancel={clearHold}
        >
          {isAm() ? t("badge.am") : t("badge.pm")}
        </div>
      </Show>

      <SettingsPanel />

      <SchedulePicker />
    </div>
  );
};
