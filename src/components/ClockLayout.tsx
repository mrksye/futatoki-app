import { createMemo, createSignal, onCleanup } from "solid-js";
import type { Component } from "solid-js";
import AnalogClock from "./AnalogClock";
import SecondsBar from "./SecondsBar";
import SettingsPanel from "./SettingsPanel";
import { useCurrentTime } from "../hooks/useCurrentTime";

export const ClockLayout: Component = () => {
  const time = useCurrentTime();

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

      {/* 現在のAM/PM表示（長押しで反対側プレビュー）: ポートレート=左センター, ランドスケープ=上センター */}
      <div
        class="absolute z-20 left-2 top-1/2 -translate-y-1/2 landscape:left-1/2 landscape:top-2 landscape:translate-y-0 landscape:-translate-x-1/2 px-3 py-1 rounded-full text-xs font-black shadow-md cursor-pointer"
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
      <div class="flex-1 flex flex-col landscape:flex-row items-stretch min-h-0">
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
