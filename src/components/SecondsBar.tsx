import { For } from "solid-js";
import type { Component } from "solid-js";
import { getHourColor, getPalette } from "../colors";
import { useSettings } from "../store/settings";

interface SecondsBarProps {
  seconds: number;
  hours: number;
}

const SecondsBar: Component<SecondsBarProps> = (props) => {
  const { settings } = useSettings();
  const color = () => getHourColor(getPalette(settings.paletteId), props.hours);

  return (
    <div class="flex w-full h-1.5 gap-[1px] px-1">
      <For each={Array.from({ length: 60 })}>
        {(_, i) => {
          const active = () => i() <= props.seconds;
          const is5 = () => i() % 5 === 0;
          return (
            <div
              class="flex-1 transition-all duration-200 ease-out"
              style={{
                "background-color": active() ? color().bg : "#e8e0f0",
                opacity: active() ? 1 : 0.25,
                "border-radius": "99px",
                height: is5() ? "6px" : "4px",
                "align-self": "center",
                "box-shadow": active() ? `0 0 4px ${color().bg}40` : "none",
              }}
            />
          );
        }}
      </For>
    </div>
  );
};

export default SecondsBar;
