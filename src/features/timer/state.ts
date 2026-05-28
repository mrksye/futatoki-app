import { createSignal } from "solid-js";
import {
  clearStoredTimer,
  isPersistedPhase,
  writeStoredTimer,
  type StoredTimer,
} from "./timer-persistence";

/**
 * 分タイマーの操作フェーズと設定値。clockMode と独立した「timer モードの中の」状態機械で、
 * timer モード out / アプリ kill / ServiceWorker 自動リロードをまたいで動き続ける (`futatoki.timer`
 * への永続化は action 末尾で行い、復元は restoreFromStorage 経由で起動時に 1 回だけ)。
 *
 * フェーズは結合した状態なので FSM (timerPhase) で表す:
 *   unset   : まだ分を選んでいない。「せっと」ボタンだけ。
 *   picking : 分を選ぶリングメニューを開いている。分を選んだ瞬間に running へ直行する (armed は廃止)。
 *   running : カウントダウン中。現在針がリアルタイムで終了マーカーへ近づく。「いちじていし」+「とりけし」。
 *   paused  : カウントダウン一時停止中。残り時間を凍結 (時計は実時刻のまま、扇=残りだけ固定)。
 *             「さいかい」+「とりけし」。
 *   done    : 残りが 0 に達した。完了音をループ再生し、盤面は完了時刻で凍結。「完了」ボタンだけ。
 *
 * 直交する次元 (選んだ分数 selectedMinutes、開始時刻 runStartMs、一時停止時の残り pausedRemainingMs) は
 * FSM に畳まず別 signal のまま持つ。生 setter は未 export。書き換えは下の action 関数経由のみ。
 *
 * 永続化は action 内 inline で write/clear する (createEffect 監視ではなく)。理由: 「書き換えは action
 * 経由のみ」invariant がそのまま「書き込みタイミングは action 末尾のみ」invariant に翻訳でき、いつ
 * localStorage が動くかが読める。一方、起動時の復元は restoreFromStorage が「発火経路」(=
 * completeTimer + アラーム発火) を一切経由しない別 call site として独立しているため、復元時に音が鳴る
 * ことが構造的にあり得ない (フラグ不要、call site 自体が分離の保証)。
 */

/** 選べる分数 (秒タイマーは作らない方針)。リングメニューにこの順で並ぶ。小刻みは 1・2・3・5 分 (4 分は外した)、
 *  以降は 5 分刻みで 60 まで = 15 択。 */
export const TIMER_MINUTE_OPTIONS = [1, 2, 3, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60] as const;

export type TimerPhase = "unset" | "picking" | "running" | "paused" | "done";

/** リングメニューが bloom する起点 (= せっとボタン中心の viewport 座標)。できごと picker の
 *  PickerOrigin と同じ役割で、数字ボタンがこの点から放射状に飛び出す演出に使う。 */
export interface RingOrigin {
  x: number;
  y: number;
}

const [timerPhase, setPhaseRaw] = createSignal<TimerPhase>("unset");
const [selectedMinutes, setSelectedMinutesRaw] = createSignal<number | null>(null);
/** running 開始時の epoch(ms)。unset / picking では null。カウントダウンの基準。 */
const [runStartMs, setRunStartMsRaw] = createSignal<number | null>(null);
/** 一時停止時に凍結した残り時間 (ms)。paused 以外では null。 */
const [pausedRemainingMs, setPausedRemainingMsRaw] = createSignal<number | null>(null);
/** リングメニューの bloom 起点。null なら画面中央から開く。 */
const [pickerOrigin, setPickerOriginRaw] = createSignal<RingOrigin | null>(null);

export { timerPhase, selectedMinutes, runStartMs, pausedRemainingMs, pickerOrigin };

/** 「せっと」を押してリングメニューを開く。origin = せっとボタン中心 (bloom 起点)。 */
export const openPicker = (origin?: RingOrigin) => {
  if (timerPhase() === "running") return;
  setPickerOriginRaw(origin ?? null);
  setPhaseRaw("picking");
};

/** リングメニューを閉じる (選択せず外側タップ等)。unset (= せっと) に戻る。 */
export const closePicker = () => {
  if (timerPhase() !== "picking") return;
  setPhaseRaw("unset");
};

/** いま動いている signal 群を localStorage 形式に畳む。永続化対象でない phase なら null を返す。
 *  各 action の末尾で呼んで writeStoredTimer に渡す。 */
const snapshotForStorage = (): StoredTimer | null => {
  const phase = timerPhase();
  if (!isPersistedPhase(phase)) return null;
  const sel = selectedMinutes();
  const start = runStartMs();
  if (sel === null || start === null) return null;
  return {
    phase,
    selectedMinutes: sel,
    endMs: start + sel * 60000,
    pausedRemainingMs: phase === "paused" ? pausedRemainingMs() : null,
  };
};

/** 現在の状態を localStorage に書き戻す。snapshotForStorage が null を返す phase は no-op
 *  (unset / picking でうっかり呼んでも害ない)。 */
const persistCurrentState = (): void => {
  const snapshot = snapshotForStorage();
  if (snapshot !== null) writeStoredTimer(snapshot);
};

/** リングメニューで分を選択 → 即 running 開始 (armed を挟まず、選んだ瞬間にカウントダウン)。現在時刻を
 *  開始基準に固定する。 */
export const selectMinutes = (m: number) => {
  setSelectedMinutesRaw(m);
  setRunStartMsRaw(Date.now());
  setPhaseRaw("running");
  persistCurrentState();
};

/** 「いちじていし」。running からのみ。残り ms を凍結して paused へ (時計は実時刻のまま動き、扇=残り
 *  だけ凍結。再開時にこの残りから続ける)。 */
export const pauseTimer = () => {
  if (timerPhase() !== "running") return;
  const sel = selectedMinutes();
  const start = runStartMs();
  if (sel === null || start === null) return;
  setPausedRemainingMsRaw(Math.max(0, start + sel * 60000 - Date.now()));
  setPhaseRaw("paused");
  persistCurrentState();
};

/** 「さいかい」。paused からのみ。凍結した残りから running を続行 (end = 今 + 残り になるよう
 *  runStartMs を再設定)。 */
export const resumeTimer = () => {
  if (timerPhase() !== "paused") return;
  const sel = selectedMinutes();
  const rem = pausedRemainingMs();
  if (sel === null || rem === null) return;
  setRunStartMsRaw(Date.now() - (sel * 60000 - rem));
  setPausedRemainingMsRaw(null);
  setPhaseRaw("running");
  persistCurrentState();
};

/** カウントダウンが 0 に達した。running → done (完了音ループ +「完了」ボタン)。盤面の時計 tick が
 *  終了時刻到達を検出して呼ぶ (TimerLayout)、および timer-alarm.ts の watch / reconcile も同じく呼ぶ
 *  (モード外発火経路)。両者は phase ガードで冪等。
 *
 *  done で localStorage を書き直すのは「kill 後の再起動でも done を見せる」ため。end+30min 自動掃除や
 *  ✓ボタンが先に来れば消える (どれが先でも収束する)。 */
export const completeTimer = () => {
  if (timerPhase() !== "running") return;
  setPhaseRaw("done");
  persistCurrentState();
};

/** 「とりけし」/「完了」。選択をクリアして unset (= せっと) に戻し、localStorage も即クリアする。
 *  ✓完了 / ✕とりけし / end+30min 自動掃除のいずれの経路もここに合流する (どれが先でも同じ結果)。 */
export const cancelTimer = () => {
  setSelectedMinutesRaw(null);
  setRunStartMsRaw(null);
  setPausedRemainingMsRaw(null);
  setPhaseRaw("unset");
  clearStoredTimer();
};

/** 起動時の復元経路。timer-watcher が readStoredTimer で得た snapshot を渡して呼ぶ「専用入口」。
 *  発火経路 (completeTimer + アラーム発火) とは完全に別 call site で、ここでは音もバイブも鳴らないし
 *  state.ts 側でも何も鳴らさない (state は副作用フリーを保つ)。書き戻し write はしない (起動直後の
 *  re-write は無意味かつ noisy)。
 *
 *  保存時 running でも復帰時点で endMs <= now (= bg/kill 中に締切を過ぎていた) なら done に補正する。
 *  そのまま running として arm するとアラームの watch が即発火検知して音を鳴らしてしまい、「復帰時に
 *  既に終わってたら無音」要件を破る。done に補正してしまえば watcher 側も arm 経路を踏まないし、
 *  TimerLayout の rAF も running ガードで completeTimer を呼ばない (= 発火経路 0 = 無音)。 */
export const restoreFromStorage = (snapshot: StoredTimer): void => {
  const effectivePhase: StoredTimer["phase"] =
    snapshot.phase === "running" && snapshot.endMs <= Date.now() ? "done" : snapshot.phase;
  const runStartMsValue = snapshot.endMs - snapshot.selectedMinutes * 60000;
  setSelectedMinutesRaw(snapshot.selectedMinutes);
  setRunStartMsRaw(runStartMsValue);
  setPausedRemainingMsRaw(effectivePhase === "paused" ? snapshot.pausedRemainingMs : null);
  setPhaseRaw(effectivePhase);
};
