import { createSignal } from "solid-js";

/**
 * 時計の主モード FSM とレイアウトのセッション状態。永続化なし (アプリ再起動で初期化)。
 *
 * モード階層:
 *   clock      : 現在時刻表示。AM/PM バッジ + 長押しプレビュー。layout は構造的に意味なし。
 *   freeRotate : ドラッグで時刻変更、1 ふんもどす、ランダム、かさね/わけ切替
 *   autoRotate : 1 日 24 秒で自動進行
 *
 * 許可する遷移 (実 UI に存在するパスのみ):
 *   clock      -> freeRotate
 *   freeRotate -> clock | autoRotate
 *   autoRotate -> clock | freeRotate
 *   (clock -> autoRotate は UI パスが無いので table で禁止。直接遷移したい場合はまず freeRotate を経由する。)
 *
 * 「clock モードで merged 表示にならない」排他性は構造で強制している:
 * 生 signal `layout` は module-private、公開 accessor は AND ガード後の `mergedVisible` のみ、
 * 公開 action `toggleLayout` も rotation 中しか動かない。書き忘れの余地が無い。
 *
 * モード遷移も table で構造化されており、setRotateMode のような unguarded passthrough setter は無い。
 * 全ての書き換えは `transition()` 経由で、許可されない遷移は no-op になる。
 *
 * 内部の生 setter (setClockModeRaw 等) と生 signal `layout` は意図的に未 export。モジュール内でも
 * 生 setter は直接呼ばず必ず action 経由で書き換える。rotateMinutes は seekRotate が 0..1439 に正規化する。
 *
 * `isRotating` / `mergedVisible` は派生関数として `clockMode` を transitively tracking する点に注意。
 * 値が同じでも `clockMode` が変われば tracked dep が動いたと見なされるため、`on(mergedVisible, ...)`
 * 等の下流 (merge-animation, crank) は callback 内で `if (curr === prev) return;` で値ベースに dedup する。
 */

export type ClockMode = "clock" | "freeRotate" | "autoRotate";

type Layout = "merged" | "separated";

function nowAsMinutes(): number {
  const d = new Date();
  return d.getHours() * 60 + d.getMinutes();
}

const [clockMode, setClockModeRaw] = createSignal<ClockMode>("clock");
const [rotateMinutes, setMinutesRaw] = createSignal(nowAsMinutes());
const [layout, setLayoutRaw] = createSignal<Layout>("merged");

export { clockMode, rotateMinutes };

/** clock モード以外 (freeRotate または autoRotate) にいるか。 */
export const isRotating = () => clockMode() !== "clock";

/** merged (かさね) 表示が実際に出ているか。clock モード中は構造的に常に false
 *  (排他性を構造で担保するため、外に露出する layout 関連 accessor はこれのみ)。 */
export const mergedVisible = () => isRotating() && layout() === "merged";

const ALLOWED_TRANSITIONS: Record<ClockMode, readonly ClockMode[]> = {
  clock:      ["freeRotate"],
  freeRotate: ["clock", "autoRotate"],
  autoRotate: ["clock", "freeRotate"],
};

const canTransition = (from: ClockMode, to: ClockMode) =>
  ALLOWED_TRANSITIONS[from].includes(to);

/**
 * 主モードの遷移。許可されていない遷移は no-op。
 * clock からの脱出時 (= rotation に入る時) のみ rotateMinutes を現在時刻にスナップし layout を merged に初期化。
 * freeRotate <-> autoRotate の往復では rotateMinutes と layout を保持 (ユーザの意図を維持)。
 */
export const transition = (next: ClockMode) => {
  const current = clockMode();
  if (!canTransition(current, next)) return;
  if (current === "clock") {
    setMinutesRaw(nowAsMinutes());
    setLayoutRaw("merged");
  }
  setClockModeRaw(next);
};

/** rotateMinutes を 0..1439 に wrap-around しながらシーク。負数も正の側に折り返す。 */
export const seekRotate = (m: number) => {
  setMinutesRaw(((m % 1440) + 1440) % 1440);
};

/** かさね/わけ切替。clock モード時は no-op (clock 中に layout を動かすと復帰時の挙動が
 *  予期せず変わるため構造的に禁止)。 */
export const toggleLayout = () => {
  if (!isRotating()) return;
  setLayoutRaw(l => l === "merged" ? "separated" : "merged");
};
