import { createSignal } from "solid-js";
import { isIosLike } from "./timer-alarm";
import chime15Url from "./sounds/chime-15min.m4a";
import chime10Url from "./sounds/chime-10min.m4a";
import chime5Url from "./sounds/chime-5min.m4a";

/**
 * カウントダウンの残り時間を知らせるマイルストーンチャイム (残り 15 / 10 / 5 分の予告音)。完了アラーム
 * (timer-alarm.ts) とは責務を分けた独立モジュールで、こちらは締切「前」の予告だけを扱う。残り分ごとに鳴らし分ける:
 *
 *   - 残り 15 分: ポッポッポッ   (短い音を 3 つ。まだ余裕があるので軽やかに)
 *   - 残り 10 分: ポーンポーーン (中くらいの「ポーン」のあと、間をあけて伸ばす「ポーーン」)
 *   - 残り  5 分: ポーーーーン   (いちばん長く伸ばした音を 1 つ。もうすぐ終わりの合図)
 *
 * 音は m4a アセット (build-tools/generate-chime-sounds.ts が合成して焼き込む。音色を変えたいときはそのスクリプトの
 * パラメータを変えて再生成し m4a をコミットする)。
 *
 * 計時はアラームと同じ哲学で「回すのは setInterval、測るのは Date.now()」。interval が発火した回数を積算すると、
 * 背景タブで throttle されたときに発火回数が減って実時間より経過が少なく見積もられ予告がズレるので、発火回数は
 * 数えず watch の中で remaining = endMs - Date.now() を物差しとして読むだけにする。鳴らすかどうかは「残りが閾値
 * 以下になった未発火のマイルストーンを鳴らす」レベル判定で、発火済みセットで各マイルストーンをちょうど 1 回に絞る。
 * 開始時点で残り以上の閾値 (= タイマー長以上) は arm で発火済みに埋めるので鳴らない (例: 15 分タイマーは開始時に
 * 残り 15 分を鳴らさず 10 分・5 分だけ)。エッジ (prev > 閾値 かつ now <= 閾値) ではなくレベルにするのは、prev が
 * 1 tick でもズレると越境を取りこぼすのを避けるため。focus/visibilitychange の復帰時照合 (reconcile) は持たない
 * (起点リセットが境界付近で取りこぼす)。
 *
 * 「どう鳴らすか」だけプラットフォームで割れるので ChimePlayer を 2 つ用意して isIosLike() で振り分ける (完了
 * アラームと同じ二エンジン思想):
 *
 *   - iOS (createHtmlAudioChimePlayer): iOS は画面ロックで AudioContext を suspend するうえ、AudioContext を
 *     resume すると完了アラームの HTMLAudio keepalive が掴んでいるオーディオセッションを奪って keepalive を壊す。
 *     なので Web Audio は使わず、各予告音を HTMLAudioElement にして arm のジェスチャ内で pre-unlock しておき、
 *     締切前の setInterval (非ジェスチャ) から再生する。背景でページ・setInterval を生かしているのは完了アラームの
 *     keepalive で、TimerActions がアラームとチャイムを必ず一緒に arm するため keepalive は常に走っている = チャイム
 *     はそのセッションに相乗りして背景でも鳴る。チャイム自身は keepalive を持たない (二重に持たない)。
 *
 *   - Android / desktop (createWebAudioChimePlayer): AudioContext はロックで suspend されないので、起動時に
 *     m4a を decode してバッファ化し、発火時に BufferSource で鳴らす (完了アラームの非 iOS エンジンと同じ経路)。
 *
 * 削除容易性: チャイムの関心事はこのファイル 1 つ (と sounds/chime-*.m4a) に隔離してある。このファイルを消し、
 * TimerActions / TimerLayout から timerChime 参照と init/arm/disarm の呼び出しを除けば、タイマーは予告音なしで動く。
 */

/** Web Audio で BufferSource を鳴らすときのリード時間 (秒)。currentTime ちょうどに start するとメインスレッド
 *  逼迫時に開始が過去落ちして取りこぼすので、わずかに未来へ置く。 */
const SCHEDULE_LEAD_SECONDS = 0.05;

/** 締切監視ポーリング間隔 (ms)。マイルストーンは分単位なので 1 秒精度で十分。背景下では throttle され得るが、
 *  毎回 Date.now() で残りを見るので間引かれても次の発火で取りこぼさない。 */
const WATCH_INTERVAL_MS = 1000;

/** 残り時間のマイルストーンと、そこで鳴らす音声アセット。remaining が大きい順に並べる: レベル判定のループで
 *  該当したものを最後に上書きすると、複数同時に閾値以下 (背景凍結明け) のとき最も差し迫った = remaining が
 *  小さい側の 1 つだけが残る。 */
const MILESTONE_CHIMES: readonly { remainingMs: number; soundUrl: string }[] = [
  { remainingMs: 15 * 60000, soundUrl: chime15Url },
  { remainingMs: 10 * 60000, soundUrl: chime10Url },
  { remainingMs: 5 * 60000, soundUrl: chime5Url },
];

/** マイルストーンチャイムの制御ハンドル。タイマー 1 本につき 1 インスタンス (アラームと同じく singleton)。 */
export interface TimerChime {
  /**
   * 新規開始 / さいかい のとき、必ずユーザージェスチャのハンドラ内から呼ぶこと (オーディオ unlock 要件)。
   * 再生エンジンを unlock し、endMs までの締切監視を始める。開始時点で残り以上の閾値は発火済みに埋めるので、
   * 開始時の発火や、さいかいで既に過ぎたマイルストーンの鳴り直しは起きない。
   */
  arm(endMs: number): void;
  /** 締切監視を止めて鳴っている予告音を止める (pause / とりけし / 完了 / モード離脱用)。 */
  disarm(): void;
  /** 全リソース解放: 監視停止・再生エンジン破棄。 */
  dispose(): void;
}

/** プラットフォーム別の「予告音をどう鳴らすか」。発火判定・監視はこの上の共通エンジンが担う。 */
interface ChimePlayer {
  /** ジェスチャ内で呼ぶ。以降 play() が (背景でも) 鳴らせるよう下ごしらえ (iOS=要素を pre-unlock / 非 iOS=resume)。 */
  unlock(): void;
  /** 指定 URL の予告音を頭から 1 回鳴らす (非ジェスチャからも)。 */
  play(soundUrl: string): void;
  /** 鳴っている予告音を止める。 */
  stopAll(): void;
  /** 解放。 */
  dispose(): void;
}

const warn = (message: string, error: unknown): void => {
  try {
    console.warn(message, error);
  } catch (_) {
    /* console 不在の環境向けの保険。ログ自体が失敗しても無視する。 */
  }
};

/** iOS 向け: HTMLAudioElement。AudioContext を作らない (作ると完了アラームの keepalive セッションを奪う)。背景
 *  再生は完了アラームの keepalive がページを生かしている前提で成立する (両者は常に一緒に arm される)。 */
async function createHtmlAudioChimePlayer(soundUrls: readonly string[]): Promise<ChimePlayer> {
  const elements = new Map<string, HTMLAudioElement>();
  for (const soundUrl of soundUrls) {
    const audio = new Audio(soundUrl);
    audio.preload = "auto";
    audio.setAttribute("playsinline", "");
    elements.set(soundUrl, audio);
  }

  // iOS は締切前の再生 (非ジェスチャ) を弾くので、arm のジェスチャ内で各要素を一度 muted で play→pause して
  // unlock しておく (完了アラームの alarm 要素と同じ手順)。
  const unlock = (): void => {
    for (const audio of elements.values()) {
      audio.muted = true;
      const promise = audio.play();
      if (promise && typeof promise.then === "function") {
        promise
          .then(() => {
            audio.pause();
            audio.currentTime = 0;
            audio.muted = false;
          })
          .catch((error) => {
            audio.muted = false;
            warn("[timer-chime] unlock failed:", error);
          });
      } else {
        audio.muted = false;
      }
    }
  };

  const play = (soundUrl: string): void => {
    const audio = elements.get(soundUrl);
    if (!audio) return;
    audio.muted = false;
    audio.currentTime = 0;
    const promise = audio.play();
    if (promise && typeof promise.catch === "function") {
      promise.catch((error) => warn("[timer-chime] play failed:", error));
    }
  };

  const stopAll = (): void => {
    for (const audio of elements.values()) {
      audio.pause();
      audio.currentTime = 0;
    }
  };

  const dispose = (): void => {
    for (const audio of elements.values()) audio.pause();
    elements.clear();
  };

  return { unlock, play, stopAll, dispose };
}

/** Android / desktop 向け: Web Audio。起動時に m4a を decode してバッファ化し、発火時は BufferSource で鳴らす。 */
async function createWebAudioChimePlayer(soundUrls: readonly string[]): Promise<ChimePlayer> {
  const ResolvedAudioContext: typeof AudioContext =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const audioContext = new ResolvedAudioContext();

  const buffers = new Map<string, AudioBuffer>();
  await Promise.all(
    soundUrls.map(async (soundUrl) => {
      const response = await fetch(soundUrl);
      buffers.set(soundUrl, await audioContext.decodeAudioData(await response.arrayBuffer()));
    }),
  );

  const startBuffer = (buffer: AudioBuffer): void => {
    const source = audioContext.createBufferSource();
    source.buffer = buffer;
    source.connect(audioContext.destination);
    source.start(audioContext.currentTime + SCHEDULE_LEAD_SECONDS);
  };

  const unlock = (): void => {
    audioContext.resume().catch((error) => warn("[timer-chime] resume failed:", error));
  };

  const play = (soundUrl: string): void => {
    const buffer = buffers.get(soundUrl);
    if (!buffer) return;
    if (audioContext.state === "suspended") {
      audioContext.resume().then(() => startBuffer(buffer)).catch((error) => {
        warn("[timer-chime] resume failed:", error);
        startBuffer(buffer);
      });
    } else {
      startBuffer(buffer);
    }
  };

  const stopAll = (): void => {
    /* 一発再生 (BufferSource) は再生後に自動解放されるので明示停止は不要。 */
  };

  const dispose = (): void => {
    audioContext.close().catch((error) => warn("[timer-chime] close failed:", error));
  };

  return { unlock, play, stopAll, dispose };
}

async function createTimerChimeEngine(): Promise<TimerChime> {
  const soundUrls = [...new Set(MILESTONE_CHIMES.map((milestone) => milestone.soundUrl))];
  const player = isIosLike()
    ? await createHtmlAudioChimePlayer(soundUrls)
    : await createWebAudioChimePlayer(soundUrls);

  let armedEndMs: number | null = null;
  /** この run で既に鳴らした (または開始時に「過ぎた」扱いにした) マイルストーンの閾値 (ms)。各マイルストーンを
   *  ちょうど 1 回に絞る。arm のたびに作り直す (= さいかいでも現在の残り以上は鳴らさない)。 */
  const firedMilestones = new Set<number>();
  let watchIntervalId: ReturnType<typeof setInterval> | null = null;
  let disposed = false;

  const checkMilestones = (): void => {
    if (armedEndMs === null) return;
    const remaining = armedEndMs - Date.now();
    let toFireUrl: string | null = null;
    for (const milestone of MILESTONE_CHIMES) {
      if (remaining <= milestone.remainingMs && !firedMilestones.has(milestone.remainingMs)) {
        firedMilestones.add(milestone.remainingMs);
        toFireUrl = milestone.soundUrl; // 降順なので最後に代入されるのが最小閾値 = 最も差し迫ったもの
      }
    }
    if (toFireUrl) player.play(toFireUrl);
  };

  const clearWatch = (): void => {
    if (watchIntervalId !== null) {
      clearInterval(watchIntervalId);
      watchIntervalId = null;
    }
  };

  const startWatch = (): void => {
    clearWatch();
    watchIntervalId = setInterval(checkMilestones, WATCH_INTERVAL_MS);
  };

  const arm = (endMs: number): void => {
    if (disposed) return;
    armedEndMs = endMs;
    // 開始時点で残り以上の閾値 (= このタイマー長以上 = もう過ぎた / 届かない) を発火済みに埋める。これで 15 分
    // タイマーは開始時に残り 15 分を鳴らさず 10/5 分だけ、20 分タイマーは 15/10/5 全部鳴る。さいかいでも現在の
    // 残り以上を発火済みにするので、既に鳴ったマイルストーンが鳴り直さない (発火セットは現在残りから再構成可能)。
    const initialRemaining = endMs - Date.now();
    firedMilestones.clear();
    for (const milestone of MILESTONE_CHIMES) {
      if (milestone.remainingMs >= initialRemaining) firedMilestones.add(milestone.remainingMs);
    }
    player.unlock();
    startWatch();
  };

  const disarm = (): void => {
    armedEndMs = null;
    clearWatch();
    player.stopAll();
  };

  const dispose = (): void => {
    if (disposed) return;
    disposed = true;
    clearWatch();
    armedEndMs = null;
    player.dispose();
  };

  return { arm, disarm, dispose };
}

/**
 * タイマーモードのセッション singleton。TimerActions のジェスチャ (arm / disarm) と TimerLayout の完了判定
 * (disarm) が同じインスタンスを触るため module スコープで共有する。生成が非同期なので signal で持つ。
 */
const [timerChime, setTimerChime] = createSignal<TimerChime | null>(null);
export { timerChime };

// in-flight な init が dispose を追い越して orphan ハンドルを残さないよう世代で守る。
let initGeneration = 0;
let initializing = false;

/** タイマーモード入室時に呼ぶ。ハンドルを生成し signal へ載せる (冪等)。 */
export const initTimerChime = (): void => {
  if (timerChime() || initializing) return;
  initializing = true;
  const generation = ++initGeneration;
  createTimerChimeEngine()
    .then((chime) => {
      if (generation !== initGeneration) {
        // 解決前に dispose / 再 init された → このハンドルは捨てる。
        chime.dispose();
        return;
      }
      setTimerChime(chime);
    })
    .catch((error) => warn("[timer-chime] init failed:", error))
    .finally(() => {
      if (generation === initGeneration) initializing = false;
    });
};

/** タイマーモード退室時に呼ぶ。ハンドルを解放し、in-flight な init があれば無効化する。 */
export const disposeTimerChime = (): void => {
  initGeneration++;
  initializing = false;
  const chime = timerChime();
  if (chime) {
    chime.dispose();
    setTimerChime(null);
  }
};
