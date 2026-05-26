import { createSignal } from "solid-js";
import timerEndM4a from "./sounds/timer-end.m4a";

/**
 * タイマー完了時のアラームを鳴らす Web Audio エンジン。旧 Howler 実装を置き換える。
 *
 * iOS の PWA はバックグラウンドに回ると JavaScript の実行が凍結されるため、終了の瞬間に JS が走る前提
 * では音を鳴らせない。そこで計時の真実は壁時計 (Date.now と目標時刻 endMs) 一点とし、音はオーディオ
 * レンダリングスレッドへ alarmSource.start(when) で予約する。予約発火は JS が凍結していても when に達した
 * 時点でスレッド側が鳴らすため、バックグラウンドでも鳴り得る。バックグラウンドで AudioContext が suspend
 * されると予約が止まるので、短い無音バッファを gain 0 でループ再生 (keepalive) して suspend を抑止し、
 * さらに復帰時 (visibilitychange / focus) に照合して取りこぼしを回収する二経路でカバーする。
 *
 * 「アプリ切替・画面消灯後に AudioContext が生き続けるか」は iOS のバージョン・端末・低電力モードで挙動
 * が割れるため、コードでは保証できない。対象 iOS 実機での検証が必須。鳴らなかった場合でも復帰時照合
 * (reconcile) で即座に鳴らし直す。
 *
 * バックエンドを持たない構成なので Web Push は使わず、アプリを完全終了 (スワイプ kill) した状態での発火は
 * 対象外 (iOS では物理的に不可能)。
 *
 * 削除容易性: 背景発火の関心事はこのファイル 1 つに隔離してある。state には依存せず、発火検知と FSM 遷移
 * (completeTimer) は TimerLayout の表示 rAF が担う。このファイルを消し、TimerLayout / TimerActions から
 * timerAlarm 参照と arm/disarm/ensureAlarmPlaying/init/dispose の呼び出しを除けば、タイマーは音なしで
 * そのまま完了する。
 */

/** 古い Safari 向けに prefix 付きコンストラクタへフォールバックする (modern iOS は無印で可)。 */
const ResolvedAudioContext: typeof AudioContext =
  window.AudioContext ??
  (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;

/** アラーム音量 (耳に痛くない控えめなレベル)。 */
const ALARM_VOLUME = 0.7;

/** keepalive 無音バッファの長さ (秒)。背景での AudioContext suspend を抑止するだけが目的なので最小限に
 *  とどめ、長尺バッファでメモリを食わないようにする (短いバッファを loop で回す)。 */
const KEEPALIVE_BUFFER_SECONDS = 0.05;

/** タイマーアラームの制御ハンドル。タイマー 1 本につき 1 インスタンス。 */
export interface TimerAlarm {
  /**
   * 必ずユーザージェスチャのハンドラ内から呼ぶこと (iOS の AudioContext unlock 要件)。AudioContext を
   * resume し、keepalive を起動し、endMs 時点の予約発火をセットする。arm 済みでも endMs で張り直す
   * (pause→resume・suspend 復帰時のドリフト補正に使用)。
   */
  arm(endMs: number): void;
  /** 予約発火を取り消す。keepalive と AudioContext は維持する (pause 用)。 */
  disarm(): void;
  /**
   * 「今鳴っているべきなら鳴っている」状態を保証する (冪等)。既存の予約／再生ソースを止めてから loop
   * 再生を開始する。フォアグラウンド発火・復帰時の取りこぼし回収から呼ぶ。loop 音なので再呼びしても
   * 継ぎ目が一瞬出るだけで二重発火にはならない。
   */
  ensureAlarmPlaying(): void;
  /** 全リソース解放: 全ソース停止・リスナ解除・AudioContext close。残留を一切残さない。 */
  dispose(): void;
}

/** アラーム音源を decode 済みで保持したハンドルを生成する。AudioContext は suspended のまま作り、resume は
 *  arm / ensureAlarmPlaying のジェスチャ経路で行う。音源は一度だけ decode してキャッシュする。 */
export async function createTimerAlarm(alarmUrl: string): Promise<TimerAlarm> {
  const audioContext = new ResolvedAudioContext();

  const alarmGain = audioContext.createGain();
  alarmGain.gain.value = ALARM_VOLUME;
  alarmGain.connect(audioContext.destination);

  const silentGain = audioContext.createGain();
  silentGain.gain.value = 0;
  silentGain.connect(audioContext.destination);

  const response = await fetch(alarmUrl);
  const encoded = await response.arrayBuffer();
  const decodedBuffer = await audioContext.decodeAudioData(encoded);

  let keepaliveSource: AudioBufferSourceNode | null = null;
  let alarmSource: AudioBufferSourceNode | null = null;
  let armedEndMs: number | null = null;
  let disposed = false;

  const warn = (message: string, error: unknown): void => {
    try {
      console.warn(message, error);
    } catch (_) {
      /* console 不在の環境向けの保険。ログ自体が失敗しても無視する。 */
    }
  };

  const resume = (): void => {
    audioContext.resume().catch((error) => warn("[timer-alarm] resume failed:", error));
  };

  // keepalive は一度起動したら dispose まで回し続ける (再起動しない)。AudioContext が走っている必要が
  // あるので resume 後に呼ぶ。
  const startKeepalive = (): void => {
    if (keepaliveSource || disposed) return;
    const length = Math.max(1, Math.round(audioContext.sampleRate * KEEPALIVE_BUFFER_SECONDS));
    const buffer = audioContext.createBuffer(1, length, audioContext.sampleRate);
    const source = audioContext.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    source.connect(silentGain);
    source.start(0);
    keepaliveSource = source;
  };

  const stopKeepalive = (): void => {
    if (!keepaliveSource) return;
    try {
      keepaliveSource.stop();
    } catch (error) {
      warn("[timer-alarm] keepalive stop failed:", error);
    }
    keepaliveSource.disconnect();
    keepaliveSource = null;
  };

  const stopAlarmSource = (): void => {
    if (!alarmSource) return;
    try {
      alarmSource.stop();
    } catch (error) {
      warn("[timer-alarm] alarm stop failed:", error);
    }
    alarmSource.disconnect();
    alarmSource = null;
  };

  const newAlarmSource = (): AudioBufferSourceNode => {
    const source = audioContext.createBufferSource();
    source.buffer = decodedBuffer;
    source.loop = true;
    source.connect(alarmGain);
    return source;
  };

  const arm = (endMs: number): void => {
    if (disposed) return;
    armedEndMs = endMs;
    resume();
    startKeepalive();
    stopAlarmSource();
    const source = newAlarmSource();
    const whenSeconds = audioContext.currentTime + Math.max(0, (endMs - Date.now()) / 1000);
    source.start(whenSeconds);
    alarmSource = source;
  };

  const disarm = (): void => {
    armedEndMs = null;
    stopAlarmSource();
  };

  const ensureAlarmPlaying = (): void => {
    if (disposed) return;
    resume();
    startKeepalive();
    stopAlarmSource();
    const source = newAlarmSource();
    source.start(0);
    alarmSource = source;
  };

  // 復帰時照合: suspend 中は AudioContext の currentTime が止まり予約発火がズレるので、壁時計から再導出して
  // 経過済みなら即鳴らし、未経過なら同じ endMs で予約を張り直す。
  const reconcile = (): void => {
    if (disposed) return;
    resume();
    if (armedEndMs === null) return;
    if (Date.now() >= armedEndMs) ensureAlarmPlaying();
    else arm(armedEndMs);
  };

  const onVisibilityChange = (): void => {
    if (document.visibilityState === "visible") reconcile();
  };
  const onFocus = (): void => reconcile();

  document.addEventListener("visibilitychange", onVisibilityChange);
  window.addEventListener("focus", onFocus);

  const dispose = (): void => {
    if (disposed) return;
    disposed = true;
    document.removeEventListener("visibilitychange", onVisibilityChange);
    window.removeEventListener("focus", onFocus);
    stopAlarmSource();
    stopKeepalive();
    armedEndMs = null;
    audioContext.close().catch((error) => warn("[timer-alarm] close failed:", error));
  };

  return { arm, disarm, ensureAlarmPlaying, dispose };
}

/**
 * タイマーモードのセッション singleton。TimerActions のジェスチャ (arm / disarm) と TimerLayout の表示
 * rAF (ensureAlarmPlaying) が同じインスタンスを触るため module スコープで共有する。createTimerAlarm が
 * 非同期 (fetch + decode) なので、解決前に取り回せるよう signal で持つ。
 */
const [timerAlarm, setTimerAlarm] = createSignal<TimerAlarm | null>(null);
export { timerAlarm };

// in-flight な init が dispose を追い越して orphan ハンドル (登録済みリスナごと) を残さないよう世代で守る。
let initGeneration = 0;
let initializing = false;

/** タイマーモード入室時に呼ぶ。音源を decode し、解決したらハンドルを signal へ載せる (冪等)。 */
export const initTimerAlarm = (): void => {
  if (timerAlarm() || initializing) return;
  initializing = true;
  const generation = ++initGeneration;
  createTimerAlarm(timerEndM4a)
    .then((alarm) => {
      if (generation !== initGeneration) {
        // 解決前に dispose / 再 init された → このハンドルは捨てる。
        alarm.dispose();
        return;
      }
      setTimerAlarm(alarm);
    })
    .catch((error) => {
      try {
        console.warn("[timer-alarm] init failed:", error);
      } catch (_) {
        /* ログ失敗は無視。 */
      }
    })
    .finally(() => {
      if (generation === initGeneration) initializing = false;
    });
};

/** タイマーモード退室時に呼ぶ。ハンドルを解放し、in-flight な init があれば無効化する。 */
export const disposeTimerAlarm = (): void => {
  initGeneration++;
  initializing = false;
  const alarm = timerAlarm();
  if (alarm) {
    alarm.dispose();
    setTimerAlarm(null);
  }
};
