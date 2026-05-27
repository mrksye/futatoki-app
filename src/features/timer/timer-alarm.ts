import { createSignal } from "solid-js";
import timerEndM4a from "./sounds/timer-end.m4a";

/**
 * タイマー完了時のアラームを鳴らすエンジン (旧 Howler 実装を置き換える)。
 *
 * 狙いは「別アプリに切り替えるところまでは行かなくても、画面消灯 (ロック) では鳴る」こと。計時の真実は壁時計
 * (endMs = runStartMs + 分*60000) 一点で、発火は背景でも走る setInterval が締切到達で鳴らす (表示更新の
 * requestAnimationFrame は画面消灯で完全停止するため発火に使わない)。フォアグラウンドの精密発火は TimerLayout
 * の rAF が別途 ensureAlarmPlaying を呼ぶ。
 *
 * 「締切で音をどう鳴らすか」がプラットフォームで割れるので、エンジンを 2 つ用意して `isIosLike()` で振り分ける:
 *
 *   - iOS (createHtmlAudioAlarm): iOS は画面ロックで AudioContext を suspend するので Web Audio は使えない。
 *     代わりに HTMLAudioElement で極小音量・低周波の無音ループ (keepalive) をジェスチャ内で再生してオーディオ
 *     セッションを掴み、ロック後もページ (と setInterval) を生かす。アラーム本体も HTMLAudioElement。締切到達は
 *     非ジェスチャなので arm のジェスチャ内でアラーム要素を一度 muted で play→pause して unlock しておく。
 *
 *   - Android / desktop (createWebAudioAlarm): HTMLAudioElement はバックグラウンドでの新規再生開始がブロック
 *     される (「一瞬鳴って消える」) が、Web Audio は一度ジェスチャで resume(unlock) すればバックグラウンドからでも
 *     鳴らせる。旧 Howler + setInterval 実装が Android で動いていたのと同じ原理。setInterval は Android なら
 *     (throttle されつつ) 裏でも走り続けるので締切で鳴らせる。AudioContext は iOS と違いロックで suspend されない
 *     ため keepalive 無音ループは不要 = 再生中メディア通知も出ない。
 *
 * どちらも復帰時照合 (reconcile): visibilitychange / focus で凍結区間の取りこぼしを回収する (締切超過なら即鳴らし、
 * 未経過なら watch を張り直す)。
 *
 * 限界: 物理ミュートスイッチが ON のときは web からは鳴らせない (ringer チャンネルへのアクセスは native 専用)。
 * 完全なバックグラウンド (別アプリへ切替・スワイプ kill) での発火は対象外。OS バージョン・端末で挙動が割れるため
 * 対象実機での検証が必須。
 *
 * 削除容易性: アラームの関心事はこのファイル 1 つに隔離してある。state には依存せず、発火検知と FSM 遷移
 * (completeTimer) は TimerLayout の表示 rAF が担う。このファイルを消し、TimerLayout / TimerActions から
 * timerAlarm 参照と arm/disarm/ensureAlarmPlaying/init/dispose の呼び出しを除けば、タイマーは音なしで完了する。
 */

/** アラーム音量 (耳に痛くない控えめなレベル)。iOS では HTMLMediaElement.volume は無視され system volume で
 *  鳴る (ハードウェアボタン制御) ため、この値が効くのは Android / desktop。 */
const ALARM_VOLUME = 0.7;

/** 締切監視ポーリング間隔 (ms)。画面消灯下では timer が throttle され得るが、毎回 Date.now() で締切を見るので
 *  間引かれても次の発火で取りこぼさない。フォアグラウンドの精密発火は TimerLayout の rAF が別途担う。 */
const WATCH_INTERVAL_MS = 1000;

/** iOS keepalive 無音ループの生成パラメータ。低周波 (スマホ/タブレットのスピーカーがほぼ再生できない帯域) で
 *  鳴らし、聞こえないが iOS に「実在する音」として認識させセッションを保持させる。セッションを掴めない端末が
 *  あれば amplitude を上げて試す (45Hz はスピーカーのサブバス再生限界以下なので上げてもほぼ聞こえない)。
 *  freq * duration を整数にしてループ境界を継ぎ目なくする (45 * 1.0 = 45 周期)。 */
const KEEPALIVE_SAMPLE_RATE = 8000;
const KEEPALIVE_DURATION_SECONDS = 1.0;
const KEEPALIVE_FREQUENCY_HZ = 45;
const KEEPALIVE_AMPLITUDE = 0.02;

/** タイマーアラームの制御ハンドル。タイマー 1 本につき 1 インスタンス。エンジン (iOS / 非 iOS) によらず同じ。 */
export interface TimerAlarm {
  /**
   * 必ずユーザージェスチャのハンドラ内から呼ぶこと (オーディオ unlock 要件)。オーディオセッションを掴み
   * (iOS は keepalive、非 iOS は AudioContext resume)、endMs までの締切監視を始める。arm 済みでも endMs で
   * 張り直す (pause→resume・復帰時のドリフト補正に使用)。
   */
  arm(endMs: number): void;
  /** 締切監視を止めてアラームを止める (pause / とりけし / モード離脱用)。 */
  disarm(): void;
  /**
   * 「今鳴っているべきなら鳴っている」状態を保証する (冪等)。締切監視を止め、アラームを頭から loop 再生する。
   * フォアグラウンド発火・watch 締切到達・復帰時照合から呼ぶ。loop 音なので再呼びしても継ぎ目が一瞬出るだけ。
   */
  ensureAlarmPlaying(): void;
  /** 全リソース解放: 再生停止・リスナ解除・監視停止。残留を一切残さない。 */
  dispose(): void;
}

/** iOS 系 (iPhone / iPad、iPadOS の Mac 偽装含む) を推定する。iOS だけ HTMLAudioElement + keepalive 方式が必要で、
 *  Android / desktop は Web Audio 方式 (旧 setInterval 実装と同原理) で鳴らす。ヒューリスティックなので実機で調整。
 *  timer-chime も「iOS では Web Audio コンテキストを作らない」判定にこれを使うので export する。 */
export const isIosLike = (): boolean => {
  const ua = navigator.userAgent;
  if (/iP(hone|ad|od)/.test(ua)) return true;
  // iPadOS 13+ は desktop Safari を偽装するので touch 数で判別する。
  return navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
};

const warn = (message: string, error: unknown): void => {
  try {
    console.warn(message, error);
  } catch (_) {
    /* console 不在の環境向けの保険。ログ自体が失敗しても無視する。 */
  }
};

/** 極小音量・低周波の無音ループ WAV を data URI で組み立てる。アセットを足さずに self-contained にする。 */
const buildKeepaliveWavDataUri = (): string => {
  const numSamples = Math.round(KEEPALIVE_SAMPLE_RATE * KEEPALIVE_DURATION_SECONDS);
  const bytesPerSample = 2;
  const dataSize = numSamples * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);
  const writeString = (offset: number, text: string): void => {
    for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i));
  };
  writeString(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true); // fmt チャンク長
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // モノラル
  view.setUint32(24, KEEPALIVE_SAMPLE_RATE, true);
  view.setUint32(28, KEEPALIVE_SAMPLE_RATE * bytesPerSample, true); // byte rate
  view.setUint16(32, bytesPerSample, true); // block align
  view.setUint16(34, 16, true); // bits per sample
  writeString(36, "data");
  view.setUint32(40, dataSize, true);
  for (let i = 0; i < numSamples; i++) {
    const sample = Math.sin((2 * Math.PI * KEEPALIVE_FREQUENCY_HZ * i) / KEEPALIVE_SAMPLE_RATE) * KEEPALIVE_AMPLITUDE;
    view.setInt16(44 + i * bytesPerSample, Math.round(Math.max(-1, Math.min(1, sample)) * 32767), true);
  }
  let binary = "";
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!);
  return "data:audio/wav;base64," + btoa(binary);
};

/** iOS 向けエンジン: HTMLAudioElement + keepalive。重い decode は無く HTMLAudioElement が自前でロードする。 */
async function createHtmlAudioAlarm(alarmUrl: string): Promise<TimerAlarm> {
  const alarmAudio = new Audio(alarmUrl);
  alarmAudio.loop = true;
  alarmAudio.preload = "auto";
  alarmAudio.volume = ALARM_VOLUME; // iOS では無視 (system volume)
  alarmAudio.setAttribute("playsinline", "");

  // keepalive: ジェスチャ内で再生開始してオーディオセッションを掴み、ロック後も setInterval を生かす。
  // muted / volume 0 ではセッションを保持できないため、聞こえないが実在する低振幅・低周波の音を鳴らす
  // (iOS は volume を無視するのでアセットの低振幅が効く)。
  const keepaliveAudio = new Audio(buildKeepaliveWavDataUri());
  keepaliveAudio.loop = true;
  keepaliveAudio.volume = 1;
  keepaliveAudio.setAttribute("playsinline", "");

  let armedEndMs: number | null = null;
  let watchIntervalId: ReturnType<typeof setInterval> | null = null;
  let disposed = false;

  const playSilently = (audio: HTMLAudioElement): void => {
    const promise = audio.play();
    if (promise && typeof promise.catch === "function") {
      promise.catch((error) => warn("[timer-alarm] play failed:", error));
    }
  };

  const startKeepalive = (): void => {
    if (disposed) return;
    playSilently(keepaliveAudio);
  };

  const stopKeepalive = (): void => {
    keepaliveAudio.pause();
    keepaliveAudio.currentTime = 0;
  };

  // iOS は締切到達時 (非ジェスチャ) に play() を弾くので、arm のジェスチャ内で一度だけ無音 play→pause して
  // 要素を unlock しておく。muted で priming 再生を無音にし、終わったら戻す。
  const unlockAlarm = (): void => {
    alarmAudio.muted = true;
    const promise = alarmAudio.play();
    if (promise && typeof promise.then === "function") {
      promise
        .then(() => {
          alarmAudio.pause();
          alarmAudio.currentTime = 0;
          alarmAudio.muted = false;
        })
        .catch((error) => {
          alarmAudio.muted = false;
          warn("[timer-alarm] alarm unlock failed:", error);
        });
    } else {
      alarmAudio.muted = false;
    }
  };

  const clearWatch = (): void => {
    if (watchIntervalId !== null) {
      clearInterval(watchIntervalId);
      watchIntervalId = null;
    }
  };

  const startWatch = (): void => {
    clearWatch();
    watchIntervalId = setInterval(() => {
      if (armedEndMs !== null && Date.now() >= armedEndMs) ensureAlarmPlaying();
    }, WATCH_INTERVAL_MS);
  };

  const arm = (endMs: number): void => {
    if (disposed) return;
    armedEndMs = endMs;
    startKeepalive();
    unlockAlarm();
    startWatch();
  };

  const disarm = (): void => {
    armedEndMs = null;
    clearWatch();
    alarmAudio.pause();
    alarmAudio.currentTime = 0;
    stopKeepalive();
  };

  const ensureAlarmPlaying = (): void => {
    if (disposed) return;
    clearWatch();
    alarmAudio.muted = false;
    alarmAudio.currentTime = 0;
    const promise = alarmAudio.play();
    if (promise && typeof promise.catch === "function") {
      promise.catch((error) => warn("[timer-alarm] alarm play failed:", error));
    }
  };

  const reconcile = (): void => {
    if (disposed || armedEndMs === null) return; // 未 arm (タイマー非稼働) なら何もしない
    if (Date.now() >= armedEndMs) {
      ensureAlarmPlaying();
    } else {
      startKeepalive();
      startWatch();
    }
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
    clearWatch();
    alarmAudio.pause();
    stopKeepalive();
    armedEndMs = null;
  };

  return { arm, disarm, ensureAlarmPlaying, dispose };
}

/** Android / desktop 向けエンジン: Web Audio。ジェスチャで resume すればバックグラウンドからでも鳴らせるので、
 *  keepalive は不要 (メディア通知も出ない)。締切は setInterval が監視する (旧 Howler + setInterval と同原理)。 */
async function createWebAudioAlarm(alarmUrl: string): Promise<TimerAlarm> {
  const ResolvedAudioContext: typeof AudioContext =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const audioContext = new ResolvedAudioContext();

  const alarmGain = audioContext.createGain();
  alarmGain.gain.value = ALARM_VOLUME;
  alarmGain.connect(audioContext.destination);

  const response = await fetch(alarmUrl);
  const decodedBuffer = await audioContext.decodeAudioData(await response.arrayBuffer());

  let alarmSource: AudioBufferSourceNode | null = null;
  let armedEndMs: number | null = null;
  let watchIntervalId: ReturnType<typeof setInterval> | null = null;
  let disposed = false;

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

  const playNow = (): void => {
    if (disposed) return;
    stopAlarmSource();
    const source = audioContext.createBufferSource();
    source.buffer = decodedBuffer;
    source.loop = true;
    source.connect(alarmGain);
    source.start(0);
    alarmSource = source;
  };

  const clearWatch = (): void => {
    if (watchIntervalId !== null) {
      clearInterval(watchIntervalId);
      watchIntervalId = null;
    }
  };

  const startWatch = (): void => {
    clearWatch();
    watchIntervalId = setInterval(() => {
      if (armedEndMs !== null && Date.now() >= armedEndMs) ensureAlarmPlaying();
    }, WATCH_INTERVAL_MS);
  };

  const arm = (endMs: number): void => {
    if (disposed) return;
    armedEndMs = endMs;
    // ジェスチャ内で resume して unlock しておく (以降はバックグラウンドからでも play できる)。
    audioContext.resume().catch((error) => warn("[timer-alarm] resume failed:", error));
    startWatch();
  };

  const disarm = (): void => {
    armedEndMs = null;
    clearWatch();
    stopAlarmSource();
  };

  const ensureAlarmPlaying = (): void => {
    if (disposed) return;
    clearWatch();
    // 背景で suspend されていれば resume してから鳴らす (resume 完了後に確実に start するため then で繋ぐ)。
    if (audioContext.state === "suspended") {
      audioContext.resume().then(playNow).catch((error) => {
        warn("[timer-alarm] resume failed:", error);
        playNow();
      });
    } else {
      playNow();
    }
  };

  const reconcile = (): void => {
    if (disposed || armedEndMs === null) return; // 未 arm (タイマー非稼働) なら何もしない
    if (Date.now() >= armedEndMs) ensureAlarmPlaying();
    else startWatch();
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
    clearWatch();
    stopAlarmSource();
    armedEndMs = null;
    audioContext.close().catch((error) => warn("[timer-alarm] close failed:", error));
  };

  return { arm, disarm, ensureAlarmPlaying, dispose };
}

/** プラットフォームに応じてエンジンを生成する。iOS は HTMLAudio + keepalive、それ以外は Web Audio。 */
export async function createTimerAlarm(alarmUrl: string): Promise<TimerAlarm> {
  return isIosLike() ? createHtmlAudioAlarm(alarmUrl) : createWebAudioAlarm(alarmUrl);
}

/**
 * タイマーモードのセッション singleton。TimerActions のジェスチャ (arm / disarm) と TimerLayout の表示
 * rAF (ensureAlarmPlaying) が同じインスタンスを触るため module スコープで共有する。createTimerAlarm が
 * 非同期なので、解決前に取り回せるよう signal で持つ。
 */
const [timerAlarm, setTimerAlarm] = createSignal<TimerAlarm | null>(null);
export { timerAlarm };

// in-flight な init が dispose を追い越して orphan ハンドル (登録済みリスナごと) を残さないよう世代で守る。
let initGeneration = 0;
let initializing = false;

/** タイマーモード入室時に呼ぶ。ハンドルを生成し signal へ載せる (冪等)。 */
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
