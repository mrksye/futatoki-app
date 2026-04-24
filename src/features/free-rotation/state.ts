import { createSignal } from "solid-js";

/**
 * 自由回転モード (じゆうかいてん) のセッション状態。
 * 永続化しない (アプリ再起動で初期状態に戻る)。
 *
 * Public API:
 *   - accessor: rotateActive, rotateMinutes, rotateMode, rotateMerged
 *   - action:   enterRotate, exitRotate, seekRotate, setRotateMode, toggleMerged
 *
 * 内部の生 setter (setActiveRaw, setMinutesRaw 等) は意図的に export していない。
 * モジュール内でも生 setter を直接呼ばず、必ず action 経由で書き換えること。
 *
 * 補足: rotateMinutes は 0..1439 に正規化される (seekRotate が wrap-around を担保)。
 *       生 setter を直接呼べる構造にすると、この invariant を壊せてしまう。
 */

/** 自由回転のサブモード: manual=手動, auto=自動進行 (らんだむは単発アクションなのでここには無い) */
export type RotateMode = "manual" | "auto";

function nowAsMinutes(): number {
  const d = new Date();
  return d.getHours() * 60 + d.getMinutes();
}

// ===== Internal state (raw setters are intentionally not exported) =====
const [rotateActive, setActiveRaw] = createSignal(false);
const [rotateMinutes, setMinutesRaw] = createSignal(nowAsMinutes());
const [rotateMode, setModeRaw] = createSignal<RotateMode>("manual");
const [rotateMerged, setMergedRaw] = createSignal(true);

// ===== Public accessors (read-only) =====
export { rotateActive, rotateMinutes, rotateMode, rotateMerged };

// ===== Public actions (only valid mutations live here) =====

/**
 * 自由回転モードに入る。
 * 入るたびに minutes=現在時刻、mode=manual、merged=true(かさね) に初期化する。
 */
export const enterRotate = () => {
  setActiveRaw(true);
  setMinutesRaw(nowAsMinutes());
  setModeRaw("manual");
  setMergedRaw(true);
};

/**
 * 自由回転モードを抜けて通常モードに戻る。
 * 次回 enter 時にきれいに初期化されるよう、mode と merged も reset しておく。
 */
export const exitRotate = () => {
  setActiveRaw(false);
  setModeRaw("manual");
  setMergedRaw(true);
};

/** rotateMinutes を 0..1439 に wrap-around しながらシーク。負数も正の側に折り返す。 */
export const seekRotate = (m: number) => {
  setMinutesRaw(((m % 1440) + 1440) % 1440);
};

export const setRotateMode = (mode: RotateMode) => setModeRaw(mode);

export const toggleMerged = () => setMergedRaw(v => !v);
