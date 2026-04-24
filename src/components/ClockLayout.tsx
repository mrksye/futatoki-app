import { createMemo, createSignal, onCleanup, Show } from "solid-js";
import type { Component } from "solid-js";
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
import {
  useMergeAnimation,
  amTransform,
  pmTransform,
  mergedTransform,
  splitShadow,
} from "../features/free-rotation/merge-animation";
import { useAmPmPreviewHold } from "../features/am-pm-preview";
import { MORPHING_SLOT } from "../features/view-transition";
import { useI18n } from "../i18n";
import { dragStart, dragAdvance, type DragDragState } from "../features/free-rotation/drag";

type DragState = DragDragState;

export const ClockLayout: Component = () => {
  const time = useCurrentTime();
  const isLandscape = useOrientation();
  const { t } = useI18n();

  // 表示用の時刻 (自由回転時は rotateMinutes、通常時はリアル時刻)
  const displayed = createMemo(() => {
    if (rotateActive()) {
      const m = rotateMinutes();
      return { hours: Math.floor(m / 60), minutes: m % 60, seconds: 0 };
    }
    return time();
  });

  // 予定アイコンとのマッチ判定用に丸めた整数分 (0..1439)。
  // 自由回転 (auto/drag) では rotateMinutes が小数になるので Math.round で四捨五入。
  const displayedMinutesTotal = createMemo(() => {
    const d = displayed();
    return ((d.hours * 60 + Math.round(d.minutes)) % 1440 + 1440) % 1440;
  });

  // AM/PM バッジ長押しで反対側プレビュー
  const actualIsAm = createMemo(() => displayed().hours < 12);
  const { isAm, startHold, clearHold } = useAmPmPreviewHold(actualIsAm);

  const amTime = createMemo(() => ({
    hours: displayed().hours % 12,
    minutes: displayed().minutes,
  }));

  const pmTime = createMemo(() => ({
    hours: displayed().hours % 12,
    minutes: displayed().minutes,
  }));

  // ===== 自由回転ドラッグ (requestAnimationFrame で間引きして低性能端末でも滑らかに) =====
  let amWrapperRef: HTMLDivElement | undefined;
  let pmWrapperRef: HTMLDivElement | undefined;
  // dragRef は高頻度 pointermove で書き換わる。signal にせず直接 mutate して allocation を抑える。
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
    // 自動回転中の背景タップ → manual に切り替えて止める
    // (SettingsPanel の左下「すとっぷ」ボタンを押すのと同等の操作)
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
    // 保留中の更新を即反映
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

  // ===== かさね/わけ アニメーションと自動回転 =====
  const { mergedVisible, transitioning } = useMergeAnimation();
  useAutoRotateTick();

  return (
    <div class="w-full h-full overflow-hidden relative">
      {/* 空背景 (自由回転時のみ) */}
      <Show when={rotateActive()}>
        <SkyBackground totalMinutes={rotateMinutes()} />
      </Show>

      {/* 時計コンテナ (自由回転時はここがドラッグ領域) */}
      <div
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
        {/* AM (ドラッグ中は裏時計を描画しない=重い opacity レイヤーも消える)
            負マージンで中央方向に少しオーバーラップ→盤面サイズは保ちつつ
            四隅にボタンスペースを確保 */}
        <div
          ref={amWrapperRef}
          class={
            "relative flex-1 flex flex-col items-center justify-center min-h-0 min-w-0 " +
            (isLandscape() ? "-mr-3" : "-mb-3")
          }
          style={{
            transform: amTransform(mergedVisible(), isLandscape()),
            // opacity は3つの状態を合成:
            //   - merged 表示中 → 0 (split 時計は隠す)
            //   - PM プレビュー長押し中 (= AM 非アクティブ) → 0.25 (薄く)
            //   - 通常 → 1
            // ここで一括にかけることで、ClockFace / ScheduleLayer / HandsLayer が
            // すべて同じ opacity の影響を受ける。
            opacity: mergedVisible() ? 0 : (isAm() ? 1 : 0.25),
            transition:
              "transform 560ms cubic-bezier(.34,1.56,.64,1), opacity 380ms ease, filter 380ms ease",
            filter: splitShadow(transitioning()),
            "will-change": transitioning() ? "transform, opacity" : "auto",
          }}
        >
          {/* AM 側を描画する条件:
                - merged 中 (transitioning 以外) は隠す → AM/PM split は表示しない
                - 自由回転 manual のドラッグ中は反対側 (= !isAm) を隠して合成負荷軽減
              ClockFace / ScheduleLayer / HandsLayer 全部にこの条件を適用する。 */}
          <Show when={(!mergedVisible() || transitioning()) && (isAm() || !dragging())}>
            <ClockFace period="am" hours={amTime().hours} />
            {/* 予定アイコンは更に merge transition 中も外す (620ms の窓) */}
            <Show when={!transitioning()}>
              <ScheduleLayer period="am" displayedMinutes={displayedMinutesTotal()} />
            </Show>
            {/* 針は予定アイコンの上に乗せる */}
            <HandsLayer hours={amTime().hours} minutes={amTime().minutes} />
          </Show>
        </div>

        {/* PM */}
        <div
          ref={pmWrapperRef}
          class={
            "relative flex-1 flex flex-col items-center justify-center min-h-0 min-w-0 " +
            (isLandscape() ? "-ml-3" : "-mt-3")
          }
          style={{
            transform: pmTransform(mergedVisible(), isLandscape()),
            // AM と対称: PM 非アクティブ (= AM プレビュー長押し中) で 0.25 に薄く
            opacity: mergedVisible() ? 0 : (isAm() ? 0.25 : 1),
            transition:
              "transform 560ms cubic-bezier(.34,1.56,.64,1), opacity 380ms ease, filter 380ms ease",
            filter: splitShadow(transitioning()),
            "will-change": transitioning() ? "transform, opacity" : "auto",
          }}
        >
          {/* PM 側 (AM 側と対称) */}
          <Show when={(!mergedVisible() || transitioning()) && (!isAm() || !dragging())}>
            <ClockFace period="pm" hours={pmTime().hours} />
            <Show when={!transitioning()}>
              <ScheduleLayer period="pm" displayedMinutes={displayedMinutesTotal()} />
            </Show>
            <HandsLayer hours={pmTime().hours} minutes={pmTime().minutes} />
          </Show>
        </div>
      </div>

      {/* かさねモード: 中央に1つの時計 (absolute レイヤ、ポインタ不干渉)
          rotateActive のトグル時も opacity/transform で滑らかに消えるよう、
          見えうる間 (mergedVisible || transitioning) は DOM に保持する。 */}
      <Show when={mergedVisible() || transitioning()}>
        <div
          class={
            "absolute inset-0 flex items-center justify-center pointer-events-none " +
            (isLandscape() ? "flex-row" : "flex-col")
          }
          style={{
            opacity: mergedVisible() ? 1 : 0,
            transform: mergedTransform(mergedVisible()),
            "transform-origin": "center",
            transition:
              "opacity 380ms ease, transform 560ms cubic-bezier(.34,1.56,.64,1), filter 380ms ease",
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
            {/* 重ね表示中: AM/PM 両方のレイヤーをこの盤面に投影。
                現在の period (displayed().hours < 12) を上 + 不透明、もう片方は強めに薄く後ろ。
                merge transition 中は AM/PM 二重描画 + 合成負荷を避けるため一時的に外す。 */}
            <Show when={!transitioning()}>
              <Show
                when={displayed().hours < 12}
                fallback={<>
                  <ScheduleLayer period="am" opacity={0.15} scale={0.85} zIndex={1}
                    displayedMinutes={displayedMinutesTotal()} />
                  <ScheduleLayer period="pm" opacity={1} zIndex={2}
                    displayedMinutes={displayedMinutesTotal()} />
                </>}
              >
                <ScheduleLayer period="pm" opacity={0.15} scale={0.85} zIndex={1}
                  displayedMinutes={displayedMinutesTotal()} />
                <ScheduleLayer period="am" opacity={1} zIndex={2}
                  displayedMinutes={displayedMinutesTotal()} />
              </Show>
            </Show>
            {/* 針は予定アイコンの上に乗せる */}
            <HandsLayer hours={displayed().hours} minutes={displayed().minutes} />
          </div>
        </div>
      </Show>

      {/* 秒バー (通常モードのみ) */}
      <Show when={!rotateActive()}>
        <div class="absolute top-0 left-0 right-0 z-10 pointer-events-none">
          <SecondsBar seconds={displayed().seconds} hours={displayed().hours} />
        </div>
      </Show>

      {/* AM/PM バッジ + 長押しプレビュー (通常モードのみ)
          自由回転 manual の予定ボタン (将来追加) と MORPHING_SLOT.LEFT を共有し、
          モード遷移時にブラウザがモーフィング描画する。
          (slot 共有関係の一覧は features/view-transition.ts を参照) */}
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

      {/* 予定モード: リングメニュー (open 時のみマウント) */}
      <SchedulePicker />
    </div>
  );
};
