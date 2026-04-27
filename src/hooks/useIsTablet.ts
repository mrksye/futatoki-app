import { createSignal, onCleanup } from "solid-js";

/** タブレット判定 (子ども向けにボタンを大きく見せる条件)。index.css の `@custom-variant tablet` と
 *  同じ条件: width >= 48rem (768px) かつ height >= 32rem (512px)。高さも見ることでスマホのランドスケープ
 *  (幅は広いが高さが低い) を除外。 */
const TABLET_QUERY = "(min-width: 48rem) and (min-height: 32rem)";

export function useIsTablet() {
  const mql = window.matchMedia(TABLET_QUERY);
  const [isTablet, setIsTablet] = createSignal(mql.matches);
  const update = (e: MediaQueryListEvent) => setIsTablet(e.matches);
  mql.addEventListener("change", update);
  onCleanup(() => mql.removeEventListener("change", update));
  return isTablet;
}
