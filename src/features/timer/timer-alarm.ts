import { createSignal } from "solid-js";
/** 完了アラーム音源。予告チャイム (build-tools/generate-chime-sounds.ts が合成) と違って生成
 *  スクリプトを持たず、Suno で作った音源をそのままコミットしてある。 */
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
 *   - Android / desktop (createWebAudioAlarm): アラーム本体は Web Audio (一度 resume すれば背景でも play できる
 *     ため iOS のような HTMLAudio + unlock の段取りは不要)。ただし現代の Chrome Android (Pixel 8a 以降の
 *     stock や Xiaomi/EMUI など) は背景タブを 5 分超で discard し、setInterval を intensive throttle するので、
 *     iOS と同じ HTMLAudio keepalive 無音ループも併走させてタブを「メディア再生中」扱いに固定する。これで
 *     discard / throttle 対象から外れ、OEM の background killer にも「使用中アプリ」と認識される。keepalive は
 *     page を生かすため、alarm 本体は Web Audio のまま (両者は audio mixer で共存)。
 *
 * 両エンジンとも MediaSession metadata を設定して OS の通知シェード / lock screen Now Playing に
 * "ふたとき・たいむうぉっち稼働中" (ローカライズ済) を出す。UX 透明性 (動いてるのが見える) と background 保護
 * (active media session 扱い) の両方に効く。
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

/** keepalive 無音ループの生成パラメータ。低周波 (スマホ/タブレットのスピーカーがほぼ再生できない帯域) で
 *  鳴らし、聞こえないが OS に「実在する音」として認識させセッションを保持させる。セッションを掴めない端末が
 *  あれば amplitude を上げて試す (45Hz はスピーカーのサブバス再生限界以下なので上げてもほぼ聞こえない)。
 *  freq * duration を整数にしてループ境界を継ぎ目なくする (45 * 1.0 = 45 周期)。 */
const KEEPALIVE_SAMPLE_RATE = 8000;
const KEEPALIVE_DURATION_SECONDS = 1.0;
const KEEPALIVE_FREQUENCY_HZ = 45;
const KEEPALIVE_AMPLITUDE = 0.02;

/** タイマーアラームの制御ハンドル。タイマー 1 本につき 1 インスタンス。エンジン (iOS / 非 iOS) によらず同じ。 */
export interface TimerAlarm {
  /**
   * 必ずユーザージェスチャのハンドラ内から呼ぶこと (オーディオ unlock 要件)。両エンジンとも keepalive を起動
   * (iOS は audio session 保持、Android は tab を media-active 扱いに固定)、iOS はアラーム要素を unlock、
   * 非 iOS は AudioContext を resume する。MediaSession の通知タイトルを mediaSessionTitle にセットして
   * endMs までの締切監視を始める。arm 済みでも endMs で張り直す (pause→resume・復帰時のドリフト補正に使用)。
   *
   * onDeadlineReached: 締切到達を watch / reconcile が検出した瞬間に、ensureAlarmPlaying の前に呼ばれる。
   * モード外発火経路の合流点で、外側 (TimerActions / timer-watcher) が「FSM を done に進める / バイブを
   * 鳴らす / チャイムを disarm する」等の音以外の副作用をここに乗せる。冪等なものを渡すこと: フォア
   * グラウンドでは TimerLayout の rAF が先に検出して同じ副作用を呼ぶため、watch 検出と二重発火するが
   * 害ない実装にしておく必要がある (completeTimer は phase ガードで no-op、navigator.vibrate は仕様で
   * 上書き)。省略時は何もしない。
   */
  arm(endMs: number, mediaSessionTitle: string, onDeadlineReached?: () => void): void;
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

/** iOS 系 (iPhone / iPad、iPadOS の Mac 偽装含む) を推定する。エンジン振り分けに使う。ヒューリスティックなので
 *  実機で調整。timer-chime も「iOS では Web Audio コンテキストを作らない」判定にこれを使うので export する。 */
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

/** keepalive ハンドル。HTMLAudio の loop 再生を start/stop で制御するだけ。両エンジン共通で、iOS は audio session
 *  保持に、Android は tab を「メディア再生中」扱いに固定して discard / intensive throttling を回避するのに使う。 */
interface Keepalive {
  start(): void;
  stop(): void;
}

const createKeepalive = (): Keepalive => {
  const audio = new Audio(buildKeepaliveWavDataUri());
  audio.loop = true;
  audio.volume = 1;
  audio.setAttribute("playsinline", "");
  return {
    start: () => {
      const promise = audio.play();
      if (promise && typeof promise.catch === "function") {
        promise.catch((error) => warn("[timer-alarm] keepalive play failed:", error));
      }
    },
    stop: () => {
      audio.pause();
      audio.currentTime = 0;
    },
  };
};

/** OS の通知シェード / lock screen の Now Playing に「稼働中」表示を出す。Android では active media session
 *  扱いになって background killer の対象から外れる効果も乗る。MediaSession 非対応環境では no-op。 */
const setMediaSessionPlaying = (title: string): void => {
  if (typeof navigator === "undefined" || !("mediaSession" in navigator)) return;
  try {
    navigator.mediaSession.metadata = new MediaMetadata({ title });
    navigator.mediaSession.playbackState = "playing";
  } catch (error) {
    warn("[timer-alarm] mediaSession set failed:", error);
  }
};

const clearMediaSession = (): void => {
  if (typeof navigator === "undefined" || !("mediaSession" in navigator)) return;
  try {
    navigator.mediaSession.playbackState = "none";
    navigator.mediaSession.metadata = null;
  } catch (error) {
    warn("[timer-alarm] mediaSession clear failed:", error);
  }
};

/** iOS 向けエンジン: HTMLAudioElement + keepalive。重い decode は無く HTMLAudioElement が自前でロードする。 */
async function createHtmlAudioAlarm(alarmUrl: string): Promise<TimerAlarm> {
  const alarmAudio = new Audio(alarmUrl);
  alarmAudio.loop = true;
  alarmAudio.preload = "auto";
  alarmAudio.volume = ALARM_VOLUME; // iOS では無視 (system volume)
  alarmAudio.setAttribute("playsinline", "");

  const keepalive = createKeepalive();

  let armedEndMs: number | null = null;
  let armedOnDeadlineReached: (() => void) | null = null;
  let watchIntervalId: ReturnType<typeof setInterval> | null = null;
  let disposed = false;

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

  // 締切到達検知の合流点。watch / reconcile の両方からここに来る。onDeadlineReached を ensureAlarmPlaying
  // より先に呼ぶ順序は固定: callback 側で FSM を done に進めてから音を鳴らした方が、TimerLayout が rAF で
  // running を見ていて完了表示に切り替わる前に音が出てしまう一瞬を避けられる (フォアグラウンド経路と
  // 視覚同期させやすい)。callback 例外は飲み込む (音まで届けるのを優先)。
  const fireDeadline = (): void => {
    if (armedOnDeadlineReached) {
      try {
        armedOnDeadlineReached();
      } catch (error) {
        warn("[timer-alarm] deadline callback failed:", error);
      }
    }
    ensureAlarmPlaying();
  };

  const startWatch = (): void => {
    clearWatch();
    watchIntervalId = setInterval(() => {
      if (armedEndMs !== null && Date.now() >= armedEndMs) fireDeadline();
    }, WATCH_INTERVAL_MS);
  };

  const arm = (endMs: number, mediaSessionTitle: string, onDeadlineReached?: () => void): void => {
    if (disposed) return;
    armedEndMs = endMs;
    armedOnDeadlineReached = onDeadlineReached ?? null;
    keepalive.start();
    setMediaSessionPlaying(mediaSessionTitle);
    unlockAlarm();
    startWatch();
  };

  const disarm = (): void => {
    armedEndMs = null;
    armedOnDeadlineReached = null;
    clearWatch();
    alarmAudio.pause();
    alarmAudio.currentTime = 0;
    keepalive.stop();
    clearMediaSession();
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
      fireDeadline();
    } else {
      keepalive.start();
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
    keepalive.stop();
    clearMediaSession();
    armedEndMs = null;
    armedOnDeadlineReached = null;
  };

  return { arm, disarm, ensureAlarmPlaying, dispose };
}

/** Android / desktop 向けエンジン: Web Audio (アラーム本体) + HTMLAudio keepalive (page 保護)。
 *  keepalive は alarm 本体とは独立に走らせて、Chrome に「メディア再生中タブ」と認識させて discard / intensive
 *  throttling を回避する。alarm 本体は Web Audio のまま (両者は audio mixer で共存)。 */
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

  const keepalive = createKeepalive();

  let alarmSource: AudioBufferSourceNode | null = null;
  let armedEndMs: number | null = null;
  let armedOnDeadlineReached: (() => void) | null = null;
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

  // HTMLAudio エンジンと同じ合流点。順序 (callback → ensureAlarmPlaying) と例外飲み込みも同様。
  const fireDeadline = (): void => {
    if (armedOnDeadlineReached) {
      try {
        armedOnDeadlineReached();
      } catch (error) {
        warn("[timer-alarm] deadline callback failed:", error);
      }
    }
    ensureAlarmPlaying();
  };

  const startWatch = (): void => {
    clearWatch();
    watchIntervalId = setInterval(() => {
      if (armedEndMs !== null && Date.now() >= armedEndMs) fireDeadline();
    }, WATCH_INTERVAL_MS);
  };

  const arm = (endMs: number, mediaSessionTitle: string, onDeadlineReached?: () => void): void => {
    if (disposed) return;
    armedEndMs = endMs;
    armedOnDeadlineReached = onDeadlineReached ?? null;
    // ジェスチャ内で resume して unlock しておく (以降はバックグラウンドからでも play できる)。
    audioContext.resume().catch((error) => warn("[timer-alarm] resume failed:", error));
    keepalive.start();
    setMediaSessionPlaying(mediaSessionTitle);
    startWatch();
  };

  const disarm = (): void => {
    armedEndMs = null;
    armedOnDeadlineReached = null;
    clearWatch();
    stopAlarmSource();
    keepalive.stop();
    clearMediaSession();
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
    if (Date.now() >= armedEndMs) fireDeadline();
    else {
      keepalive.start();
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
    stopAlarmSource();
    keepalive.stop();
    clearMediaSession();
    armedEndMs = null;
    armedOnDeadlineReached = null;
    audioContext.close().catch((error) => warn("[timer-alarm] close failed:", error));
  };

  return { arm, disarm, ensureAlarmPlaying, dispose };
}

/** プラットフォームに応じてエンジンを生成する。iOS は HTMLAudio + keepalive、それ以外は Web Audio + keepalive。 */
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
