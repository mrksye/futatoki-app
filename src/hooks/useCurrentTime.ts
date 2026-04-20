import { createSignal, onCleanup, onMount } from "solid-js";

interface CurrentTime {
  hours: number;
  minutes: number;
  seconds: number;
}

export function useCurrentTime() {
  const now = new Date();
  const [time, setTime] = createSignal<CurrentTime>({
    hours: now.getHours(),
    minutes: now.getMinutes(),
    seconds: now.getSeconds(),
  });

  let timer: ReturnType<typeof setInterval>;

  onMount(() => {
    timer = setInterval(() => {
      const d = new Date();
      setTime({
        hours: d.getHours(),
        minutes: d.getMinutes(),
        seconds: d.getSeconds(),
      });
    }, 1000);
  });

  onCleanup(() => clearInterval(timer));

  return time;
}
