import { createSignal } from "solid-js";

/**
 * 分タイマーの操作フェーズと設定値。clockMode === "timer" の間だけ意味を持つセッション状態
 * (永続化なし)。clockMode FSM (free-rotation/state.ts) とは別軸 = timer モードの「中の」状態機械。
 *
 * フェーズは結合した状態なので FSM (timerPhase) で表す:
 *   unset   : まだ分を選んでいない。「せっと」ボタンだけ。
 *   picking : 分を選ぶリングメニューを開いている。
 *   armed   : 分を選択済みでまだ開始していない。「すたーと」+「とりけし」。黒い終了マーカー針を表示。
 *   running : カウントダウン中。グレーの現在針がリアルタイムで終了マーカーへ近づく。
 *
 * 直交する次元 (選んだ分数 selectedMinutes、開始時刻 runStartMs) は FSM に畳まず別 signal のまま持つ。
 * 生 setter は未 export。書き換えは下の action 関数経由のみ。
 */

/** 選べる分数 (秒タイマーは作らない方針)。リングメニューにこの順で並ぶ。 */
export const TIMER_MINUTE_OPTIONS = [1, 3, 5, 10, 15, 30, 45, 60] as const;

export type TimerPhase = "unset" | "picking" | "armed" | "running";

/** リングメニューが bloom する起点 (= せっとボタン中心の viewport 座標)。できごと picker の
 *  PickerOrigin と同じ役割で、数字ボタンがこの点から放射状に飛び出す演出に使う。 */
export interface RingOrigin {
  x: number;
  y: number;
}

const [timerPhase, setPhaseRaw] = createSignal<TimerPhase>("unset");
const [selectedMinutes, setSelectedMinutesRaw] = createSignal<number | null>(null);
/** running 開始時の epoch(ms)。unset / armed では null。カウントダウンの基準。 */
const [runStartMs, setRunStartMsRaw] = createSignal<number | null>(null);
/** リングメニューの bloom 起点。null なら画面中央から開く。 */
const [pickerOrigin, setPickerOriginRaw] = createSignal<RingOrigin | null>(null);

export { timerPhase, selectedMinutes, runStartMs, pickerOrigin };

/** 「せっと」を押してリングメニューを開く。origin = せっとボタン中心 (bloom 起点)。 */
export const openPicker = (origin?: RingOrigin) => {
  if (timerPhase() === "running") return;
  setPickerOriginRaw(origin ?? null);
  setPhaseRaw("picking");
};

/** リングメニューを閉じる (外側タップ等)。選択済みなら armed、未選択なら unset に戻る。 */
export const closePicker = () => {
  if (timerPhase() !== "picking") return;
  setPhaseRaw(selectedMinutes() === null ? "unset" : "armed");
};

/** リングメニューで分を選択 → armed へ。黒い終了マーカーはこの時点から見える。 */
export const selectMinutes = (m: number) => {
  setSelectedMinutesRaw(m);
  setPhaseRaw("armed");
};

/** 「すたーと」。armed からのみ。現在時刻を開始基準に固定して running へ。 */
export const startTimer = () => {
  if (timerPhase() !== "armed" || selectedMinutes() === null) return;
  setRunStartMsRaw(Date.now());
  setPhaseRaw("running");
};

/** 「とりけし」。選択をクリアして unset (= せっと) に戻す。armed / running のどちらからでも。 */
export const cancelTimer = () => {
  setSelectedMinutesRaw(null);
  setRunStartMsRaw(null);
  setPhaseRaw("unset");
};
