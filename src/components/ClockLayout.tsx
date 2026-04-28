import { createMemo, createSignal, onCleanup, onMount, Show } from "solid-js";
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
import { rotateActive, rotateMinutes, rotateMode, seekRotate, setRotateMode } from "../features/free-rotation/state";
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
import { MORPHING_SLOT } from "../features/view-transition";
import { useI18n } from "../i18n";
import { dragStart, dragAdvance, type DragDragState } from "../features/free-rotation/drag";
import { wheelAdvance } from "../features/free-rotation/wheel";
import { resistTrigger, notifyResistance } from "../features/free-rotation/resistance";

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

export const ClockLayout: Component = () => {
  const time = useCurrentTime();
  const isLandscape = useOrientation();
  const { t } = useI18n();

  const displayed = createMemo(() => {
    if (rotateActive()) {
      const m = rotateMinutes();
      return { hours: Math.floor(m / 60), minutes: m % 60, seconds: 0 };
    }
    return time();
  });

  /** event match 用に整数分へ snap (自由回転中は rotateMinutes が小数になり得るため)。 */
  const displayedMinutesTotal = createMemo(() => {
    const d = displayed();
    return ((d.hours * 60 + Math.round(d.minutes)) % 1440 + 1440) % 1440;
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
  const [dragging, setDragging] = createSignal(false);
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

  const onDragStart = (e: PointerEvent) => {
    if (!rotateActive()) return;
    // 自動回転中の背景タップは manual へ切替て停止 (左下「すとっぷ」と同等の操作)。
    if (rotateMode() === "auto") {
      setRotateMode("manual");
      return;
    }
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragRef = dragStart(e, rotateMinutes());
    setDragging(true);
  };

  const onDragMove = (e: PointerEvent) => {
    const s = dragRef;
    if (!s || e.pointerId !== s.pointerId) return;
    schedule(dragAdvance(e, s));
  };

  const onDragEnd = (e: PointerEvent) => {
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
  });

  let wheelTarget: number | null = null;
  /** session 内の累積 float (snap 前)。session idle まで保持して連続 wheel の小数累積を続けて取る。 */
  let wheelTargetFloat: number | null = null;
  let wheelTweenStartTime = 0;
  let wheelTweenStartMinutes = 0;
  let wheelTweenRaf: number | null = null;
  let wheelSessionIdleTimer: ReturnType<typeof setTimeout> | undefined;
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
    if (!rotateActive() || rotateMode() !== "manual") return;
    if (dragging()) return;
    e.preventDefault();
    const result = wheelAdvance(e);
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
    () => previewFlipped() || (rotateActive() && !transitioning()),
  );

  /** AM/PM 各 wrapper の表示条件: merged 中 (transitioning 以外) は隠す。drag 中は反対側を unmount
   *  して合成負荷を軽減する。 */
  const amSplitVisible = createMemo(() => (!mergedVisible() || transitioning()) && (isAm() || !dragging()));
  const pmSplitVisible = createMemo(() => (!mergedVisible() || transitioning()) && (!isAm() || !dragging()));

  return (
    <div class="w-full h-full overflow-hidden relative">
      <Show when={rotateActive()}>
        <SkyBackground totalMinutes={rotateMinutes()} />
      </Show>

      <div
        ref={containerRef}
        class={"absolute inset-0 flex items-stretch " + (isLandscape() ? "flex-row" : "flex-col")}
        style={{
          "touch-action": rotateActive() && rotateMode() === "manual" ? "none" : "auto",
          cursor:
            rotateActive() && rotateMode() === "manual"
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
            <DimOverlay opacity={amSelectionOpacity()}>
              <ClockFace period="am" hours={amTime().hours} />
            </DimOverlay>
            {/* ScheduleLayer は dim 階層の外。merge transition 中は外す (620ms 重い合成回避) */}
            <Show when={!transitioning()}>
              <ScheduleLayer
                period="am"
                dimmed={!isAm()}
                displayedMinutes={displayedMinutesTotal()}
              />
            </Show>
            {/* document order が後ろ → 予定アイコンの上に乗る */}
            <DimOverlay opacity={amSelectionOpacity()}>
              <HandsLayer hours={amTime().hours} minutes={amTime().minutes} shakeKey={resistTrigger} />
            </DimOverlay>
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
            <DimOverlay opacity={pmSelectionOpacity()}>
              <ClockFace period="pm" hours={pmTime().hours} />
            </DimOverlay>
            <Show when={!transitioning()}>
              <ScheduleLayer
                period="pm"
                dimmed={isAm()}
                displayedMinutes={displayedMinutesTotal()}
              />
            </Show>
            <DimOverlay opacity={pmSelectionOpacity()}>
              <HandsLayer hours={pmTime().hours} minutes={pmTime().minutes} shakeKey={resistTrigger} />
            </DimOverlay>
          </Show>
        </div>
      </div>

      {/* かさねモード container。rotateActive トグル時も滑らかに消えるよう、見えうる間
          (mergedVisible || transitioning) は DOM に保持する。
          opacity / transform は mergedRevealed 経由 (false→true 時に 1 frame 遅延 → fresh mount でも
          CSS transition が発火する。詳細は merge-animation.ts)。 */}
      <Show when={mergedVisible() || transitioning()}>
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
          }}
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
                merge transition 中は二重描画コスト回避で外す。 */}
            <Show when={!transitioning()}>
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
            <HandsLayer hours={displayed().hours} minutes={displayed().minutes} shakeKey={resistTrigger} />
          </div>
        </div>
      </Show>

      <Show when={!rotateActive()}>
        <div class="absolute top-0 left-0 right-0 z-10 pointer-events-none">
          <SecondsBar seconds={displayed().seconds} hours={displayed().hours} />
        </div>
      </Show>

      {/* AM/PM バッジ。MORPHING_SLOT.LEFT を rotate manual の予定ボタンと共有してモード遷移時に
          ブラウザがモーフィング描画する (slot 一覧は features/view-transition.ts)。 */}
      <Show when={!rotateActive()}>
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
