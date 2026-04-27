import { createSignal } from "solid-js";

/**
 * 自由回転モード (じゆうかいてん) のセッション状態。永続化なし (アプリ再起動で初期化)。
 *
 * モード階層:
 *   通常モード (rotateActive=false): 現在時刻 + AM/PM バッジ長押しプレビュー
 *   自由回転モード (rotateActive=true)
 *     ├─ manual: ドラッグ時刻変更 / 1 ふんもどす / ランダム / かさね・わけ切替
 *     └─ auto:   1 日 24 秒で自動進行
 *
 * 「通常モードで merged 表示にならない」排他性は構造で強制している:
 * 生 signal `rotateMerged` は module-private、公開 accessor は AND ガード後の `mergedVisible` のみ、
 * 公開 action `toggleMerged` も rotateActive 中しか動かない。書き忘れの余地が無い。
 *
 * 内部の生 setter (setActiveRaw 等) と生 signal は意図的に未 export。モジュール内でも生 setter は
 * 直接呼ばず必ず action 経由で書き換える。rotateMinutes は seekRotate が 0..1439 に正規化する。
 */

/** 自由回転のサブモード (らんだむは単発アクションなのでここには含まれない)。 */
export type RotateMode = "manual" | "auto";

function nowAsMinutes(): number {
  const d = new Date();
  return d.getHours() * 60 + d.getMinutes();
}

const [rotateActive, setActiveRaw] = createSignal(false);
const [rotateMinutes, setMinutesRaw] = createSignal(nowAsMinutes());
const [rotateMode, setModeRaw] = createSignal<RotateMode>("manual");
const [rotateMerged, setMergedRaw] = createSignal(true);

export { rotateActive, rotateMinutes, rotateMode };

/** merged (かさね) 表示が実際に出ているか。rotateActive との AND を返す
 *  (排他性を構造で担保するため、外に露出する merged 関連 accessor はこれのみ)。 */
export const mergedVisible = () => rotateActive() && rotateMerged();

/** 自由回転モードに入る。minutes=現在時刻、mode=manual、merged=true で毎回初期化。 */
export const enterRotate = () => {
  setActiveRaw(true);
  setMinutesRaw(nowAsMinutes());
  setModeRaw("manual");
  setMergedRaw(true);
};

/** 自由回転モードを抜けて通常モードへ。次回 enter 時に綺麗に初期化されるよう mode/merged も reset。 */
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

/** かさね/わけ切替。rotateActive=false 時は no-op (通常モード中に merged を動かすと復帰時の挙動が
 *  予期せず変わるため構造的に禁止)。 */
export const toggleMerged = () => {
  if (!rotateActive()) return;
  setMergedRaw(v => !v);
};
