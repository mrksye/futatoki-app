import { createSignal, onCleanup } from "solid-js";

/** 表示領域の幅・高さを追跡する。resize / orientationchange に同期。useOrientation と平行で
 *  使うことが多いが、こちらは数値そのものを返す (向き判定でなく寸法を使う計算用)。 */
export function useViewport() {
  const [width, setWidth] = createSignal(window.innerWidth);
  const [height, setHeight] = createSignal(window.innerHeight);

  const update = () => {
    setWidth(window.innerWidth);
    setHeight(window.innerHeight);
  };
  window.addEventListener("resize", update);
  window.addEventListener("orientationchange", update);

  onCleanup(() => {
    window.removeEventListener("resize", update);
    window.removeEventListener("orientationchange", update);
  });

  return { width, height };
}
