import { createSignal, onCleanup } from "solid-js";

/** iOS PWA (apple-mobile-web-app-capable=yes + viewport-fit=cover) で notch / home indicator が
 *  侵入する viewport 端の幅を取得する。env(safe-area-inset-*) を hidden probe 要素の padding に
 *  焼き付けて getComputedStyle で読み取る (CSS 変数の raw 文字列をそのまま読むと "max(...)" が
 *  解決前で返るため probe 経由が必要)。
 *
 *  resize / orientationchange に同期。Android / desktop / 通常 Safari では env() が 0 を返すので
 *  全ゼロのオブジェクトになる。 */
export function useSafeAreaInsets() {
  const probe = document.createElement("div");
  probe.style.cssText =
    "position:fixed;top:0;left:0;width:0;height:0;visibility:hidden;pointer-events:none;" +
    "padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)";
  document.body.appendChild(probe);

  const read = () => {
    const cs = getComputedStyle(probe);
    return {
      top: parseFloat(cs.paddingTop) || 0,
      right: parseFloat(cs.paddingRight) || 0,
      bottom: parseFloat(cs.paddingBottom) || 0,
      left: parseFloat(cs.paddingLeft) || 0,
    };
  };

  const [insets, setInsets] = createSignal(read());
  const update = () => setInsets(read());
  window.addEventListener("resize", update);
  window.addEventListener("orientationchange", update);

  onCleanup(() => {
    window.removeEventListener("resize", update);
    window.removeEventListener("orientationchange", update);
    probe.remove();
  });

  return insets;
}
