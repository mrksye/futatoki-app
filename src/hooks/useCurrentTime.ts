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
 * 1 秒間隔で現在時刻を更新する signal を返す hook。
 * chronostasis 中 (= ピッカー open 等で下層を凍結している間) は setInterval を停止し、
 * 解除した瞬間に最新時刻にスナップして再開する (止まっていた間の経過分を吸収)。
 */
export function useCurrentTime() {
  const [time, setTime] = createSignal<CurrentTime>(snapshot());
  const inChronostasis = useChronostasis();

  createEffect(
    on(inChronostasis, (active) => {
      if (active) return; // chronostasis 中は interval 止めたまま
      // 解除時 (= 初回 mount 含む): 即座に最新時刻に揃えて interval 再開
      setTime(snapshot());
      const timer = setInterval(() => setTime(snapshot()), 1000);
      onCleanup(() => clearInterval(timer));
    }),
  );

  return time;
}
