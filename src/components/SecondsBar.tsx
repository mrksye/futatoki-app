import { For } from "solid-js";
import type { Component } from "solid-js";
import { getPalette, getSecondsBarColor } from "../colors";
import { paletteId } from "../features/settings/palette";

interface SecondsBarProps {
  seconds: number;
  hours: number;
}

const SecondsBar: Component<SecondsBarProps> = (props) => {
  const color = () => getSecondsBarColor(getPalette(paletteId()), props.hours);

  return (
    <div class="flex w-full h-1.5 gap-[1px] px-1">
      <For each={Array.from({ length: 59 })}>
        {(_, i) => {
          // seconds=0 は 0 本明るい (全 dim)、seconds=59 で全 59 本明るい。
          const active = () => i() < props.seconds;
          // 5 の倍数の目盛り = 5 番目, 10 番目, ... = 0-index で i=4, 9, 14, ... なので (i+1)%5。
          const is5 = () => (i() + 1) % 5 === 0;
          return (
            <div
              class="flex-1 transition-all duration-200 ease-out"
              style={{
                "background-color": active() ? color() : "#e8e0f0",
                opacity: active() ? 1 : 0.25,
                "border-radius": "99px",
                height: is5() ? "6px" : "4px",
                "align-self": "center",
                "box-shadow": active() ? `0 0 4px ${color()}40` : "none",
              }}
            />
          );
        }}
      </For>
    </div>
  );
};

export default SecondsBar;
