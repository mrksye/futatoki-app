import { createEffect, createMemo, createSignal, on, onCleanup, Show, untrack } from "solid-js";
import type { Component } from "solid-js";
import AnalogClock from "./AnalogClock";
import SecondsBar from "./SecondsBar";
import SettingsPanel from "./SettingsPanel";
import SkyBackground from "./SkyBackground";
import { useCurrentTime } from "../hooks/useCurrentTime";
import { useOrientation } from "../hooks/useOrientation";
import { useSettings } from "../store/settings";
import { strings } from "../strings";

type DragState =
  | {
      style: "drag";
      lastX: number;
      lastY: number;
      cumPixels: number;
      startMinutes: number;
      pointerId: number;
    }
  | {
      style: "crank";
      pivotX: number;
      pivotY: number;
      lastAngle: number;
      cumulative: number;
      maxAngle: number;
      startMinutes: number;
      pointerId: number;
    };

/** どらっぐ: 何ピクセルで1分進むか */
const PX_PER_MINUTE = 6;

export const ClockLayout: Component = () => {
  const time = useCurrentTime();
  const isLandscape = useOrientation();
  const { rotate, setRotateMinutes } = useSettings();

  // 表示用の時刻（自由回転時は rotate.minutes、通常時はリアル時刻）
  const displayed = createMemo(() => {
    if (rotate.active) {
      const m = rotate.minutes;
      return { hours: Math.floor(m / 60), minutes: m % 60, seconds: 0 };
    }
    return time();
  });

  // AM/PMバッジ押してる間だけ反対側をプレビュー
  const [flipped, setFlipped] = createSignal(false);
  const startHold = () => setFlipped(true);
  const clearHold = () => setFlipped(false);
  onCleanup(clearHold);

  const isAm = createMemo(() => {
    const actual = displayed().hours < 12;
    return flipped() ? !actual : actual;
  });

  const amTime = createMemo(() => ({
    hours: displayed().hours % 12,
    minutes: displayed().minutes,
  }));

  const pmTime = createMemo(() => ({
    hours: displayed().hours % 12,
    minutes: displayed().minutes,
  }));

  // ===== 自由回転ドラッグ（rAF throttle で低性能端末でも滑らかに） =====
  let amWrapperRef: HTMLDivElement | undefined;
  let pmWrapperRef: HTMLDivElement | undefined;
  // dragRef は高頻度 pointermove で書き換わる。signal にせず直接 mutate して allocation 抑える
  let dragRef: DragState | null = null;
  const [dragging, setDragging] = createSignal(false);
  let pendingMinutes: number | null = null;
  let rafId: number | null = null;

  const commitPending = () => {
    rafId = null;
    if (pendingMinutes !== null) {
      setRotateMinutes(pendingMinutes);
      pendingMinutes = null;
    }
  };

  const schedule = (m: number) => {
    pendingMinutes = m;
    if (rafId === null) rafId = requestAnimationFrame(commitPending);
  };

  const nearestClockCenter = (clientX: number, clientY: number): { cx: number; cy: number } | null => {
    const refs = [amWrapperRef, pmWrapperRef].filter(Boolean) as HTMLDivElement[];
    if (refs.length === 0) return null;
    let best: { cx: number; cy: number; dist: number } | null = null;
    for (const ref of refs) {
      const r = ref.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      const dist = Math.hypot(clientX - cx, clientY - cy);
      if (!best || dist < best.dist) best = { cx, cy, dist };
    }
    return best ? { cx: best.cx, cy: best.cy } : null;
  };

  const onDragStart = (e: PointerEvent) => {
    if (!rotate.active || rotate.mode !== "manual") return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    if (rotate.style === "crank") {
      const pivot = nearestClockCenter(e.clientX, e.clientY);
      if (!pivot) return;
      const a = (Math.atan2(e.clientY - pivot.cy, e.clientX - pivot.cx) * 180) / Math.PI;
      dragRef = {
        style: "crank",
        pivotX: pivot.cx,
        pivotY: pivot.cy,
        lastAngle: a,
        cumulative: 0,
        maxAngle: 0,
        startMinutes: rotate.minutes,
        pointerId: e.pointerId,
      };
    } else {
      dragRef = {
        style: "drag",
        lastX: e.clientX,
        lastY: e.clientY,
        cumPixels: 0,
        startMinutes: rotate.minutes,
        pointerId: e.pointerId,
      };
    }
    setDragging(true);
  };

  const onDragMove = (e: PointerEvent) => {
    const s = dragRef;
    if (!s || e.pointerId !== s.pointerId) return;
    if (s.style === "crank") {
      const a = (Math.atan2(e.clientY - s.pivotY, e.clientX - s.pivotX) * 180) / Math.PI;
      let delta = a - s.lastAngle;
      while (delta > 180) delta -= 360;
      while (delta < -180) delta += 360;
      s.cumulative += delta;
      s.lastAngle = a;
      if (s.cumulative > s.maxAngle) {
        s.maxAngle = s.cumulative;
        schedule(s.startMinutes + s.maxAngle / 6);
      }
    } else {
      const dx = e.clientX - s.lastX;
      const dy = e.clientY - s.lastY;
      s.cumPixels += Math.hypot(dx, dy);
      s.lastX = e.clientX;
      s.lastY = e.clientY;
      schedule(s.startMinutes + s.cumPixels / PX_PER_MINUTE);
    }
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
      setRotateMinutes(pendingMinutes);
      pendingMinutes = null;
    }
  };

  onCleanup(() => {
    if (rafId !== null) cancelAnimationFrame(rafId);
  });

  // ===== 自動回転: 1日 ≒ 24 秒で進行 =====
  const MIN_PER_MS = 1440 / 24000;
  createEffect(
    on(
      () => rotate.active && rotate.mode === "auto",
      (running) => {
        if (!running) return;
        let last = performance.now();
        let id = 0;
        const tick = (now: number) => {
          const dt = now - last;
          last = now;
          setRotateMinutes(untrack(() => rotate.minutes) + dt * MIN_PER_MS);
          id = requestAnimationFrame(tick);
        };
        id = requestAnimationFrame(tick);
        onCleanup(() => cancelAnimationFrame(id));
      },
    ),
  );

  return (
    <div class="w-full h-full overflow-hidden relative">
      {/* 空背景（自由回転時のみ） */}
      <Show when={rotate.active}>
        <SkyBackground totalMinutes={rotate.minutes} />
      </Show>

      {/* 時計コンテナ（自由回転時はここがドラッグ領域） */}
      <div
        class={"absolute inset-0 flex items-stretch " + (isLandscape() ? "flex-row" : "flex-col")}
        style={{
          "touch-action": rotate.active && rotate.mode === "manual" ? "none" : "auto",
          cursor:
            rotate.active && rotate.mode === "manual"
              ? (dragging() ? "grabbing" : "grab")
              : "default",
        }}
        onPointerDown={onDragStart}
        onPointerMove={onDragMove}
        onPointerUp={onDragEnd}
        onPointerCancel={onDragEnd}
      >
        {/* AM（ドラッグ中は裏時計を描画しない=重い opacity レイヤーも消える） */}
        <div ref={amWrapperRef} class="flex-1 flex flex-col items-center justify-center min-h-0 min-w-0">
          <Show when={isAm() || !dragging()}>
            <AnalogClock
              period="am"
              hours={amTime().hours}
              minutes={amTime().minutes}
              dimmed={!isAm()}
            />
          </Show>
        </div>

        {/* PM */}
        <div ref={pmWrapperRef} class="flex-1 flex flex-col items-center justify-center min-h-0 min-w-0">
          <Show when={!isAm() || !dragging()}>
            <AnalogClock
              period="pm"
              hours={pmTime().hours}
              minutes={pmTime().minutes}
              dimmed={isAm()}
            />
          </Show>
        </div>
      </div>

      {/* 秒バー（通常モードのみ） */}
      <Show when={!rotate.active}>
        <div class="absolute top-0 left-0 right-0 z-10 pointer-events-none">
          <SecondsBar seconds={displayed().seconds} hours={displayed().hours} />
        </div>
      </Show>

      {/* 現在のAM/PM表示（通常モードのみ） */}
      <Show when={!rotate.active}>
        <div
          class={
            "absolute z-20 px-3 py-1 md:px-4 md:py-1.5 rounded-full text-xs md:text-sm font-black shadow-md cursor-pointer " +
            (isLandscape()
              ? "left-1/2 top-2 -translate-x-1/2"
              : "left-2 top-1/2 -translate-y-1/2")
          }
          style={{
            "background-color": isAm() ? "#0080D8" : "#E02068",
            color: "#ffffff",
            "touch-action": "none",
          }}
          onPointerDown={startHold}
          onPointerUp={clearHold}
          onPointerLeave={clearHold}
          onPointerCancel={clearHold}
        >
          {isAm() ? strings.badge.am : strings.badge.pm}
        </div>
      </Show>

      <SettingsPanel />
    </div>
  );
};
