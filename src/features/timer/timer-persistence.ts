import { BRAND_CONFIG } from "../../../branding/brand.config";
import { type TimerPhase } from "./state";

/**
 * 分タイマーの localStorage 永続化レイヤー。アプリ kill / モード切替 / ServiceWorker 自動リロードを
 * またいでカウントダウンを存続させるための pure な I/O 境界で、state.ts (in-memory FSM) にも UI にも
 * 依存しない (循環防止のため state は型 import のみ)。
 *
 * 保存単位は単一キー `futatoki.timer` の JSON 1 オブジェクト。state.ts が持つ 4 つの signal を
 * 個別キーに分けると「phase=running なのに runStartMs=null」のような中間状態 (= 不整合) が
 * シリアライズ境界で観測される隙が出るため、atomic write で一括する。
 *
 * 「計時の真実は壁時計 (endMs) 一点」(timer-alarm.ts 冒頭の宣言と整合) なので runStartMs ではなく
 * endMs を保存する。復元時に runStartMs は endMs - selectedMinutes*60000 で逆算する (state.ts の
 * restoreFromStorage)。
 *
 * クリア経路は 3 つ: (a) ✓完了 / ✕とりけし (state.ts cancelTimer から)、(b) end+30min 自動掃除
 * (timer-watcher の setTimeout)、(c) 起動時 read で 30min 超データを検出 → ここで silent に消す。
 * どのトリガが先に来ても同じ結果 (= 空) に収束する。
 */

const STORAGE_KEY = `${BRAND_CONFIG.storagePrefix}.timer`;
const AUTO_CLEAR_DELAY_MS = 30 * 60 * 1000;

/** localStorage に書き出す形。phase が unset / picking のときは「保存する意味のある状態」ではないので
 *  そもそも書かない (state.ts 側の action ガードで担保)。 */
export interface StoredTimer {
  phase: "running" | "paused" | "done";
  /** カウントダウンの長さ (分)。分指定は TIMER_MINUTE_OPTIONS の整数、時刻指定は「今から目標時刻まで」の
   *  端数あり実数。どちらも endMs の逆算 (endMs - selectedMinutes*60000) に使う。 */
  selectedMinutes: number;
  /** 締切 epoch(ms)。running/done は runStartMs + selectedMinutes*60000、paused は arbitrary
   *  (pauseTimer 時点での「もし時間が止まらなかったら鳴っていた時刻」と等価)。 */
  endMs: number;
  /** paused のとき凍結した残り (ms)、それ以外は null。 */
  pausedRemainingMs: number | null;
}

const warn = (message: string, error: unknown): void => {
  try {
    console.warn(message, error);
  } catch (_) {
    /* console 不在環境でログ自体が失敗しても無視する。 */
  }
};

const isValidPhase = (value: unknown): value is StoredTimer["phase"] =>
  value === "running" || value === "paused" || value === "done";

/** カウントダウン長 (分) として妥当か。分指定は整数だが時刻指定は端数ありなので「正の有限実数で 24 時間
 *  以内」まで許す (上限はサニタイズ用の保険で、リングの選択肢は最大でも 1 時間程度)。 */
const isValidMinutes = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value > 0 && value <= 24 * 60;

/** localStorage から読み込み、サニタイズ + 30min 超データの自動クリアまで一括で行う。1 つでも不整合
 *  (壊れた JSON / 知らない phase / 範囲外 minutes / 締切から 30min 超過) があれば clear して null を返す。
 *  起動時に 1 回だけ呼ぶ前提 (timer-watcher)。 */
export const readStoredTimer = (): StoredTimer | null => {
  let raw: string | null;
  try {
    raw = localStorage.getItem(STORAGE_KEY);
  } catch (error) {
    warn(`[timer-persistence] ${STORAGE_KEY} read failed:`, error);
    return null;
  }
  if (raw === null) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    warn(`[timer-persistence] ${STORAGE_KEY} parse failed:`, error);
    clearStoredTimer();
    return null;
  }

  if (parsed === null || typeof parsed !== "object") {
    clearStoredTimer();
    return null;
  }
  const candidate = parsed as Record<string, unknown>;
  if (!isValidPhase(candidate.phase)) {
    clearStoredTimer();
    return null;
  }
  if (!isValidMinutes(candidate.selectedMinutes)) {
    clearStoredTimer();
    return null;
  }
  if (typeof candidate.endMs !== "number" || !Number.isFinite(candidate.endMs)) {
    clearStoredTimer();
    return null;
  }
  // 30min 超データは「無かったこと」にする (end から 30min 経ったら自動消去のルール)。end が未来の場合は
  // ここでは通す (running / paused の正常状態)。
  if (Date.now() - candidate.endMs > AUTO_CLEAR_DELAY_MS) {
    clearStoredTimer();
    return null;
  }

  const maxRemainingMs = candidate.selectedMinutes * 60000;
  let pausedRemainingMs: number | null;
  if (candidate.phase === "paused") {
    if (
      typeof candidate.pausedRemainingMs !== "number" ||
      !Number.isFinite(candidate.pausedRemainingMs) ||
      candidate.pausedRemainingMs < 0 ||
      candidate.pausedRemainingMs > maxRemainingMs
    ) {
      clearStoredTimer();
      return null;
    }
    pausedRemainingMs = candidate.pausedRemainingMs;
  } else {
    pausedRemainingMs = null;
  }

  return {
    phase: candidate.phase,
    selectedMinutes: candidate.selectedMinutes,
    endMs: candidate.endMs,
    pausedRemainingMs,
  };
};

/** state.ts の action 末尾から呼ばれる。failure は warn だけで例外を投げない (タイマー本体の動作を
 *  ストレージ I/O で妨げない)。 */
export const writeStoredTimer = (snapshot: StoredTimer): void => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
  } catch (error) {
    warn(`[timer-persistence] ${STORAGE_KEY} write failed:`, error);
  }
};

/** ✓/✕/30min 自動掃除のいずれからも呼ばれる「終わりの統一入口」。冪等。 */
export const clearStoredTimer = (): void => {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (error) {
    warn(`[timer-persistence] ${STORAGE_KEY} clear failed:`, error);
  }
};

/** TimerPhase が永続化対象かどうかの判定。unset / picking はそもそも永続化しない (在席中の操作画面に
 *  すぎないので保存する意味がない)。state.ts や watcher が action 内で「いま書くべきか」判定に使う。 */
export const isPersistedPhase = (phase: TimerPhase): phase is StoredTimer["phase"] =>
  phase === "running" || phase === "paused" || phase === "done";

export { AUTO_CLEAR_DELAY_MS };
