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
 * パラメータを変えて再生成し m4a をコミットする)。実行時はこれを decode して BufferSource で鳴らす = 完了アラームと
 * 同じ再生経路。以前はオシレータでその場合成していたが Android で発火が不安定だったため、アラームと同じ
 * 「録音済みバッファ再生」に揃えた (= Android でも確実に鳴る)。
 *
 * 計時はアラームと同じ哲学で「回すのは setInterval、測るのは Date.now()」。interval が発火した回数を積算すると、
 * 背景タブで throttle されたときに発火回数が減って実時間より経過が少なく見積もられ予告がズレるので、発火回数は
 * 数えず watch の中で remaining = endMs - Date.now() を物差しとして読むだけにする (コストはほぼ 0)。鳴らすかどうかは
 * 「残りが閾値以下になった未発火のマイルストーンを鳴らす」レベル判定で、発火済みセットで各マイルストーンをちょうど
 * 1 回に絞る。開始時点で残り以上の閾値 (= タイマー長以上) は arm で発火済みに埋めるので鳴らない (例: 15 分タイマーは
 * 開始時に残り 15 分を鳴らさず 10 分・5 分だけ)。エッジ (prev > 閾値 かつ now <= 閾値) ではなくレベルにするのは、
 * prev が 1 tick でもズレると越境を取りこぼすのを避けるため。
 *
 * プラットフォーム制約 — iOS ではチャイムを一切動かさない (initTimerChime が iOS で即 return し AudioContext を
 * 作らない)。iOS の完了アラームは HTMLAudio の keepalive 無音ループで単一オーディオセッションを掴んで背景生存
 * しているが、そこへチャイムが Web Audio の AudioContext を resume するとセッションを奪い合い keepalive のグリップ
 * が外れて、ロック中に肝心の完了アラームが鳴らなくなる (timer-alarm の失敗策②と同根)。チャイムは「あれば嬉しい
 * 予告」、完了アラームは「絶対鳴らす本命」なので、衝突する iOS では本命を最優先してチャイムを諦める。よって
 * チャイムは Android / desktop 専用機能。Android / desktop の AudioContext はロックで suspend されないため、
 * 前景でも背景でも鳴る (背景で凍結していた場合は復帰後の最初の判定で、またいだ中の最も差し迫った 1 つを鳴らす)。
 *
 * 削除容易性: チャイムの関心事はこのファイル 1 つ (と sounds/chime-*.m4a) に隔離してある。このファイルを消し、
 * TimerActions / TimerLayout から timerChime 参照と init/arm/disarm の呼び出しを除けば、タイマーは予告音なしで動く。
 */

/** スケジュールのリード時間 (秒)。currentTime ちょうどに start すると、メインスレッドが詰まっているとき開始が
 *  「過去」に落ちて取りこぼすことがある。わずかに未来へ置いて確実に発音させる。 */
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
   * AudioContext を resume し、endMs までの締切監視を始める。開始時点で残り以上の閾値は発火済みに埋めるので、
   * 開始時の発火や、さいかいで既に過ぎたマイルストーンの鳴り直しは起きない。
   */
  arm(endMs: number): void;
  /** 締切監視を止める (pause / とりけし / 完了 / モード離脱用)。チャイムは loop しないので止める音はない。 */
  disarm(): void;
  /** 全リソース解放: 監視停止・AudioContext close。 */
  dispose(): void;
}

const warn = (message: string, error: unknown): void => {
  try {
    console.warn(message, error);
  } catch (_) {
    /* console 不在の環境向けの保険。ログ自体が失敗しても無視する。 */
  }
};

async function createTimerChimeEngine(): Promise<TimerChime> {
  const ResolvedAudioContext: typeof AudioContext =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const audioContext = new ResolvedAudioContext();

  // 各アセットを起動時に一度だけ decode してバッファ化しておく (完了アラームと同じ。発火時は BufferSource で
  // 鳴らすだけ)。soundUrl をキーにする。
  const chimeBuffers = new Map<string, AudioBuffer>();
  await Promise.all(
    [...new Set(MILESTONE_CHIMES.map((milestone) => milestone.soundUrl))].map(async (soundUrl) => {
      const response = await fetch(soundUrl);
      chimeBuffers.set(soundUrl, await audioContext.decodeAudioData(await response.arrayBuffer()));
    }),
  );

  let armedEndMs: number | null = null;
  /** この run で既に鳴らした (または開始時に「過ぎた」扱いにした) マイルストーンの閾値 (ms)。各マイルストーンを
   *  ちょうど 1 回に絞る。arm のたびに作り直す (= さいかいでも現在の残り以上は鳴らさない)。 */
  const firedMilestones = new Set<number>();
  let watchIntervalId: ReturnType<typeof setInterval> | null = null;
  let disposed = false;

  /** 録音済みバッファを BufferSource で鳴らす。背景 suspend からの復帰時は resume してから鳴らす。source は
   *  再生し終えると自動で解放される。 */
  const playChime = (soundUrl: string): void => {
    if (disposed) return;
    const buffer = chimeBuffers.get(soundUrl);
    if (!buffer) return;
    const start = () => {
      const source = audioContext.createBufferSource();
      source.buffer = buffer;
      source.connect(audioContext.destination);
      source.start(audioContext.currentTime + SCHEDULE_LEAD_SECONDS);
    };
    if (audioContext.state === "suspended") {
      audioContext.resume().then(start).catch((error) => {
        warn("[timer-chime] resume failed:", error);
        start();
      });
    } else {
      start();
    }
  };

  /** 残りが閾値以下になった未発火のマイルストーンを鳴らす。複数が同時に該当したら (背景凍結明け) 最も差し迫った
   *  1 つだけ鳴らし、残りも発火済みにして連発を避ける。残りは積算ではなく endMs - Date.now() を読むだけなので、
   *  interval が間引かれてもズレない。レベル判定なので prev のタイミングに依存せず、閾値を下回れば次の tick で確実に鳴る。 */
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
    if (toFireUrl) playChime(toFireUrl);
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
    audioContext.resume().catch((error) => warn("[timer-chime] resume failed:", error));
    startWatch();
  };

  const disarm = (): void => {
    armedEndMs = null;
    clearWatch();
  };

  // アラームと違い visibilitychange / focus の復帰時照合 (reconcile) は持たない。focus や可視化のたびに起点を
  // リセットすると、ちょうど閾値をまたぐ前後でその回のチャイムを取りこぼす (レベル判定では起点を持たないので
  // そもそも不要)。setInterval + レベル判定だけに任せれば前景は確実に鳴り、背景凍結明けも checkMilestones が
  // またいだ中の最も差し迫った 1 つを鳴らす。締切ちょうどの発火は timer-alarm が担当する。

  const dispose = (): void => {
    if (disposed) return;
    disposed = true;
    clearWatch();
    armedEndMs = null;
    audioContext.close().catch((error) => warn("[timer-chime] close failed:", error));
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

/** タイマーモード入室時に呼ぶ。ハンドルを生成し signal へ載せる (冪等)。iOS では AudioContext を作らず即 return
 *  する (timerChime() は null のまま = arm/disarm 呼び出しは optional chaining で no-op)。これで iOS の完了
 *  アラームの keepalive オーディオセッションをチャイムが奪わない。 */
export const initTimerChime = (): void => {
  if (isIosLike()) return;
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
