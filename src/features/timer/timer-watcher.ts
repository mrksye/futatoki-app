import { createEffect, on, onCleanup, onMount } from "solid-js";
import { useI18n } from "../../i18n";
import { transition } from "../free-rotation/state";
import { firstLaunchActive } from "../first-launch";
import {
  cancelTimer,
  completeTimer,
  restoreFromStorage,
  runStartMs,
  selectedMinutes,
  timerPhase,
} from "./state";
import {
  disposeTimerAlarm,
  initTimerAlarm,
  timerAlarm,
} from "./timer-alarm";
import {
  disposeTimerChime,
  initTimerChime,
  timerChime,
} from "./timer-chime";
import { ONE_HOUR_MS, readStoredTimer } from "./timer-persistence";

/**
 * 分タイマーの App レベル singleton ハブ。App.tsx で 1 回だけ useTimerWatcher() を呼ぶ。
 *
 * timer のライフタイム = App のライフタイム (= ブラウザタブ寿命) に張り替え、TimerActions の
 * mount/unmount (= timer モードの出入り) から独立させる。これにより:
 *   - モード切替で alarm/chime が disposed されず arm 状態を保つ
 *   - 完了時刻に達したら、たとえ timer モード外でも音とバイブが鳴る (timer-alarm の watch 経路 →
 *     ここで渡す onDeadlineReached callback)
 *   - アプリ kill 後の再起動で futatoki.timer から自動復元 + 強制 timer モード入室
 *
 * 「発火経路」と「復元経路」の分離は state.ts 側の design choice (completeTimer vs restoreFromStorage が
 * 別 action) で保証されており、ここからは復元時に completeTimer を呼ばない (したがって音は鳴らない)。
 *
 * FirstLaunchSplash との同居: Splash は「clock モード + split 着地」を前提に振り付けされているため、
 * 演出途中で transition("timer") を強制すると裏のレイアウトが timer 盤に切り替わり着地が壊れる。
 * firstLaunchActive() が false (= 演出完走、または PWA standalone で初期値 false) になるまで復元を
 * 遅延し、一度試みたら再実行は封じる。
 *
 * ServiceWorker 自動リロード (index.tsx の controllerchange → location.reload) との関係: reload は
 * ページごと作り直すので onCleanup / disposeTimerAlarm は走らず in-memory リソースは OS にまかせて
 * 破棄される (実害なし)。新ページ起動でこの watcher が動き、futatoki.timer から復元する = 自動更新を
 * またいで継続する経路がそのまま走る。
 */

/** 完了時のバイブパターン (Vibration API 対応端末のみ。iOS は非対応で実質 Android 向け)。フォアグラウンド
 *  経路の TimerLayout の rAF 側にも同じ定数があるが、watch / reconcile 経由のモード外発火経路でも
 *  振動させたいのでここにも持つ。Vibration API は仕様で「直前 pattern を上書き」なので二重発火しても
 *  害なし。 */
const ALARM_VIBRATE_PATTERN = [200, 100, 200];

export const useTimerWatcher = (): void => {
  const { t } = useI18n();

  // ── alarm / chime のライフサイクル ────────────────────────────────────────────────
  // 旧 TimerActions onMount/onCleanup の場所替え。タブ寿命に張ることでモード切替の影響を受けない。
  // dispose は実用上ほぼ呼ばれない (SW reload は location.reload で skip)。
  onMount(() => {
    initTimerAlarm();
    initTimerChime();
  });
  onCleanup(() => {
    disposeTimerAlarm();
    disposeTimerChime();
  });

  // ── 締切到達時の音以外副作用 ──────────────────────────────────────────────────
  // timer-alarm.ts の watch / reconcile が締切を検知したらここを呼ぶ (ensureAlarmPlaying の前)。
  // モード外でも TimerLayout が unmount されてる状態でも FSM を done に進められる経路の合流点。
  // フォアグラウンドの TimerLayout rAF も同じ副作用を独自に起こすが、completeTimer は phase ガードで
  // 冪等、navigator.vibrate は仕様で「直前 pattern を上書き」、chime disarm は内部で no-op を許容。
  const onDeadlineReached = (): void => {
    completeTimer();
    if (typeof navigator.vibrate === "function") navigator.vibrate(ALARM_VIBRATE_PATTERN);
    timerChime()?.disarm();
  };

  // ── 起動時復元 ────────────────────────────────────────────────────────────
  // Splash 競合を避けるため firstLaunchActive() が false になるまで待つ。on() は defer なしなので
  // PWA standalone の初期値 false でも初回発火する = Splash 不要な経路でも素直に動く。一度試みたら
  // restoreAttempted ガードで再実行を封じる (firstLaunchActive はもう変わらないが念のため)。
  let restoreAttempted = false;
  createEffect(
    on(firstLaunchActive, (active) => {
      if (active) return;
      if (restoreAttempted) return;
      restoreAttempted = true;

      const snapshot = readStoredTimer();
      if (snapshot === null) return; // データなし、または 1h 超で捨てられた

      restoreFromStorage(snapshot);
      transition("timer");

      // arm 判定は復元「後」の in-memory phase で見る。restoreFromStorage は snapshot.phase=running でも
      // 復帰時点で endMs <= now なら done に補正する (無音 done 要件) ので、ここを timerPhase() で読めば
      // 「すでに過ぎてた running は arm しない」が自動で従う。paused は元から disarm 状態、done は鳴り
      // 終わり扱いで arm 経路を踏まない。
      //
      // alarm/chime の init は非同期 (Web Audio decode で数百 ms 単位) なので、signal accessor の解決を
      // 待つ effect で arm する。snapshot.endMs は変数なので余計な reactive tracking はない。
      //
      // iOS 注意: arm はジェスチャ要件があるが、起動時自動復元はジェスチャ外。unlockAlarm は失敗時
      // warn で死なないので watch (setInterval) と keepalive は機能する。完全 kill 後の iOS 復活で
      // 音が出ないケースは構造的限界として受容 (プラン記載のリスク)。
      if (timerPhase() === "running") {
        createEffect(() => {
          const alarm = timerAlarm();
          if (alarm) alarm.arm(snapshot.endMs, t("timer.runningTitle"), onDeadlineReached);
          const chime = timerChime();
          if (chime) chime.arm(snapshot.endMs);
        });
      }
    }),
  );

  // ── end + 1h 自動クリア ──────────────────────────────────────────────────────
  // phase / runStartMs / selectedMinutes が動くたびに setTimeout を仕込み直す。対象は running / done のみ
  // (paused は明示停止中で end+1h 概念が成立しないので除外、ユーザの明示再開かとりけしまで残す)。
  // setTimeout は背景 throttling で大幅に遅れるが、(a) visibility 復帰時の reconcile / (b) 次回起動時の
  // readStoredTimer 内 1h check が冗長救済になる。実害は「1h 超 localStorage に一時残留」のみ。
  let autoCleanupTimerId: ReturnType<typeof setTimeout> | null = null;
  const clearAutoCleanup = () => {
    if (autoCleanupTimerId !== null) {
      clearTimeout(autoCleanupTimerId);
      autoCleanupTimerId = null;
    }
  };
  createEffect(() => {
    const phase = timerPhase();
    const start = runStartMs();
    const sel = selectedMinutes();
    clearAutoCleanup();
    if (phase !== "running" && phase !== "done") return;
    if (sel === null || start === null) return;
    const deadline = start + sel * 60000 + ONE_HOUR_MS;
    const delay = Math.max(0, deadline - Date.now());
    autoCleanupTimerId = setTimeout(() => {
      autoCleanupTimerId = null;
      // cancelTimer = clearStoredTimer + state を unset (画面も自動で unset へ戻る)。
      // alarm/chime は cancelTimer 経由では止まらないので別途 disarm。
      cancelTimer();
      timerAlarm()?.disarm();
      timerChime()?.disarm();
    }, delay);
  });
  onCleanup(clearAutoCleanup);
};
