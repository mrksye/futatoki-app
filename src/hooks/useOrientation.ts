import { createSignal, onCleanup } from "solid-js";

/**
 * 表示領域のアスペクト比を追跡。
 * デバイスの物理向きではなく、実際のビューポートが横長かどうかで判定する。
 * （横幅 > 高さ なら landscape 扱い）
 */
export function useOrientation() {
  const compute = (): boolean => window.innerWidth > window.innerHeight;

  const [isLandscape, setIsLandscape] = createSignal(compute());

  const update = () => setIsLandscape(compute());
  window.addEventListener("resize", update);
  window.addEventListener("orientationchange", update);

  onCleanup(() => {
    window.removeEventListener("resize", update);
    window.removeEventListener("orientationchange", update);
  });

  return isLandscape;
}
