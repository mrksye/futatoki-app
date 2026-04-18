import { createSignal, onCleanup } from "solid-js";

/**
 * ディスプレイの向きを追跡。OSの画面回転ロックを尊重する。
 *
 * CSSの `@media (orientation)` は一部Androidブラウザで
 * ローテーションロック中でもデバイスの物理向きで発火してしまうため、
 * `screen.orientation.type` を優先して使う。
 */
export function useOrientation() {
  const compute = (): boolean => {
    const type = (window.screen as Screen & { orientation?: ScreenOrientation })
      .orientation?.type;
    if (type) return type.startsWith("landscape");
    return window.innerWidth > window.innerHeight;
  };

  const [isLandscape, setIsLandscape] = createSignal(compute());

  const update = () => setIsLandscape(compute());
  const orient = (window.screen as Screen & { orientation?: ScreenOrientation })
    .orientation;
  orient?.addEventListener("change", update);
  window.addEventListener("resize", update);

  onCleanup(() => {
    orient?.removeEventListener("change", update);
    window.removeEventListener("resize", update);
  });

  return isLandscape;
}
