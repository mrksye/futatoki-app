import { createEffect, createSignal, on, onCleanup } from "solid-js";
import { useChronostasis } from "../lib/chronostasis/solid";

interface CurrentTime {
  hours: number;
  minutes: number;
  seconds: number;
}

const snapshot = (): CurrentTime => {
  const d = new Date();
  return { hours: d.getHours(), minutes: d.getMinutes(), seconds: d.getSeconds() };
};

/**
 * 1 秒間隔で現在時刻を更新する signal。chronostasis 中 (ピッカー open / merge transition 等で下層
 * 凍結中) は setInterval を停止し、解除時に最新時刻にスナップして再開する (止まっていた間の経過分を吸収)。
 */
export function useCurrentTime() {
  const [time, setTime] = createSignal<CurrentTime>(snapshot());
  const inChronostasis = useChronostasis();

  createEffect(
    on(inChronostasis, (held) => {
      if (held) return;
      setTime(snapshot());
      const timer = setInterval(() => setTime(snapshot()), 1000);
      onCleanup(() => clearInterval(timer));
    }),
  );

  return time;
}
