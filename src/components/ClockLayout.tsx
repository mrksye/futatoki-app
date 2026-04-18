import { createMemo, createSignal, onCleanup } from "solid-js";
import type { Component } from "solid-js";
import AnalogClock from "./AnalogClock";
import SecondsBar from "./SecondsBar";
import SettingsPanel from "./SettingsPanel";
import { useCurrentTime } from "../hooks/useCurrentTime";
import { useOrientation } from "../hooks/useOrientation";

export const ClockLayout: Component = () => {
  const time = useCurrentTime();
  const isLandscape = useOrientation();

  // AM/PMバッジ押してる間だけ反対側をプレビュー
  const [flipped, setFlipped] = createSignal(false);
  const startHold = () => setFlipped(true);
  const clearHold = () => setFlipped(false);
  onCleanup(clearHold);

  const isAm = createMemo(() => {
    const actual = time().hours < 12;
    return flipped() ? !actual : actual;
  });

  const amTime = createMemo(() => ({
    hours: time().hours % 12,
    minutes: time().minutes,
  }));

  const pmTime = createMemo(() => ({
    hours: time().hours >= 12 ? time().hours % 12 : time().hours % 12,
    minutes: time().minutes,
  }));

  return (
    <div class="w-full h-full flex flex-col overflow-hidden relative">
      {/* 秒バー：存在感は最小限 */}
      <SecondsBar seconds={time().seconds} hours={time().hours} />

      {/* 現在のAM/PM表示（押してる間だけ反対側プレビュー）: ポートレート=左センター, ランドスケープ=上センター */}
      <div
        class={
          "absolute z-20 px-3 py-1 rounded-full text-xs font-black shadow-md cursor-pointer " +
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
        {isAm() ? "\u2600\uFE0F AM" : "\u{1F319} PM"}
      </div>

      {/* 時計を画面いっぱいに！paddingもgapも最小！ */}
      <div class={"flex-1 flex items-stretch min-h-0 " + (isLandscape() ? "flex-row" : "flex-col")}>
        {/* AM */}
        <div class="flex-1 flex flex-col items-center justify-center min-h-0 min-w-0">
          <AnalogClock
            period="am"
            hours={amTime().hours}
            minutes={amTime().minutes}
            dimmed={!isAm()}
          />
        </div>

        {/* PM */}
        <div class="flex-1 flex flex-col items-center justify-center min-h-0 min-w-0">
          <AnalogClock
            period="pm"
            hours={pmTime().hours}
            minutes={pmTime().minutes}
            dimmed={isAm()}
          />
        </div>
      </div>

      <SettingsPanel />
    </div>
  );
};
