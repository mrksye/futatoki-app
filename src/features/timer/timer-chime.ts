import { createSignal } from "solid-js";
import { isIosLike } from "./timer-alarm";

/**
 * カウントダウンの残り時間を知らせるマイルストーンチャイム (残り 15 分 / 10 分 / 5 分の「ポーン」音)。
 * 完了アラーム (timer-alarm.ts) とは責務を分けた独立モジュールで、こちらは締切「前」の予告だけを扱う。
 * アラームが loop 再生する m4a 音源なのに対し、チャイムは Web Audio のオシレータでその場合成する短い音
 * (アセット不要、self-contained)。残り分ごとに鳴らし分ける:
 *
 *   - 残り 15 分: ポンポンポン     (短い音を 3 つ。まだ余裕があるので軽やかに)
 *   - 残り 10 分: ポーーンポーーン (伸ばした音を 2 つ)
 *   - 残り  5 分: ポーーーーン     (いちばん長く伸ばした音を 1 つ。もうすぐ終わりの合図)
 *
 * 計時はアラームと同じ哲学で「回すのは setInterval、測るのは Date.now()」。interval が発火した回数を積算
 * すると、背景タブで throttle されたときに発火回数が減って実時間より経過が少なく見積もられ予告がズレるので、
 * 発火回数は数えず watch の中で remaining = endMs - Date.now() を物差しとして読むだけにする (コストはほぼ 0)。
 * 鳴らすかどうかは「残りが閾値以下になった未発火のマイルストーンを鳴らす」レベル判定で、発火済みセットで各
 * マイルストーンをちょうど 1 回に絞る。開始時点で残り以上の閾値 (= タイマー長以上) は arm で発火済みに埋めるので
 * 鳴らない (例: 15 分タイマーは開始時に残り 15 分を鳴らさず 10 分・5 分だけ)。エッジ (prev > 閾値 かつ now <=
 * 閾値) ではなくレベルにするのは、prev が 1 tick でもズレると越境を取りこぼすのを避けるため。
 *
 * プラットフォーム制約 — iOS ではチャイムを一切動かさない (initTimerChime が iOS で即 return し AudioContext を
 * 作らない)。iOS の完了アラームは HTMLAudio の keepalive 無音ループで単一オーディオセッションを掴んで背景生存
 * しているが、そこへチャイムが Web Audio の AudioContext を resume するとセッションを奪い合い keepalive のグリップ
 * が外れて、ロック中に肝心の完了アラームが鳴らなくなる (timer-alarm の失敗策②と同根)。チャイムは「あれば嬉しい
 * 予告」、完了アラームは「絶対鳴らす本命」なので、衝突する iOS では本命を最優先してチャイムを諦める。よって
 * チャイムは Android / desktop 専用機能。Android / desktop の AudioContext はロックで suspend されないため、
 * 前景でも背景でも鳴る (背景で凍結していた場合は復帰後の最初の判定で、またいだ中の最も差し迫った 1 つを鳴らす)。
 * 復帰時照合 (reconcile) は持たない — それがあると focus / 可視化のたびに起点がリセットされて境界付近のチャイムを
 * 取りこぼすため (詳細は下の disarm 付近のコメント)。
 *
 * 削除容易性: チャイムの関心事はこのファイル 1 つに隔離してある。このファイルを消し、TimerActions /
 * TimerLayout から timerChime 参照と init/arm/disarm の呼び出しを除けば、タイマーは予告音なしで動く。
 */

/** チャイムの基準周波数 (Hz)。880 = A5 の澄んだベル音。3 マイルストーンとも同じ音色で「ポーン」の同一性を保つ
 *  (鳴らし分けは音程ではなく音数と余韻の長さで行う)。 */
const CHIME_FREQUENCY_HZ = 880;

/** ピーク音量 (アラームの 0.7 より控えめ。予告なので耳に優しく)。 */
const CHIME_PEAK_GAIN = 0.3;

/** アタック時間 (秒)。立ち上がりを速くし、以降の指数減衰で「ポーン」の余韻を作る。 */
const CHIME_ATTACK_SECONDS = 0.01;

/** スケジュールのリード時間 (秒)。currentTime ちょうどに start すると、メインスレッドが詰まっているとき開始が
 *  「過去」に落ちてアタックや音そのものを取りこぼすことがある。わずかに未来へ置いて確実に発音させる。 */
const SCHEDULE_LEAD_SECONDS = 0.05;

/** 余韻の長さ (秒)。「ポン」= 短い (15分)、「ポーーン」= 中くらいに伸ばす (10分)、「ポーーーーン」= 長く伸ばす
 *  (5分)。「ン」を伸ばす長さの差になる。 */
const SHORT_BEEP_SECONDS = 0.13;
const LONG_BEEP_SECONDS = 0.7;
const LONGER_BEEP_SECONDS = 1.5;

/** 連続する音の onset 間隔 (前の音が鳴り始めてから次が鳴り始めるまでの秒)。余韻より長くして粒を分ける
 *  (LONG_GAP は LONG_BEEP より長くないと 2 音が重なって「ポーーンポーーン」が 1 つに繋がって聞こえる)。 */
const SHORT_GAP_SECONDS = 0.22;
const LONG_GAP_SECONDS = 0.95;

/** 締切監視ポーリング間隔 (ms)。マイルストーンは分単位なので 1 秒精度で十分。背景下では throttle され得るが、
 *  毎回 Date.now() で残りを見るので間引かれても次の発火で取りこぼさない。 */
const WATCH_INTERVAL_MS = 1000;

/** 1 つの「ポーン」音。chime の先頭からの開始オフセットと余韻の長さで表す。 */
interface Beep {
  startOffsetSeconds: number;
  durationSeconds: number;
}

/** 残り 15 分: ポンポンポン。 */
const THREE_SHORT_BEEPS: readonly Beep[] = [
  { startOffsetSeconds: 0, durationSeconds: SHORT_BEEP_SECONDS },
  { startOffsetSeconds: SHORT_GAP_SECONDS, durationSeconds: SHORT_BEEP_SECONDS },
  { startOffsetSeconds: SHORT_GAP_SECONDS * 2, durationSeconds: SHORT_BEEP_SECONDS },
];

/** 残り 10 分: ポーーンポーーン。 */
const TWO_LONG_BEEPS: readonly Beep[] = [
  { startOffsetSeconds: 0, durationSeconds: LONG_BEEP_SECONDS },
  { startOffsetSeconds: LONG_GAP_SECONDS, durationSeconds: LONG_BEEP_SECONDS },
];

/** 残り 5 分: ポーーーーン。 */
const ONE_LONGER_BEEP: readonly Beep[] = [
  { startOffsetSeconds: 0, durationSeconds: LONGER_BEEP_SECONDS },
];

/** 残り時間のマイルストーンと、そこで鳴らすパターン。remaining が大きい順に並べる: 越境判定のループで
 *  またいだものを最後に上書きすると、複数同時越境 (背景凍結明け) のとき最も差し迫った = remaining が
 *  小さい側の 1 つだけが残る。 */
const MILESTONE_CHIMES: readonly { remainingMs: number; beeps: readonly Beep[] }[] = [
  { remainingMs: 15 * 60000, beeps: THREE_SHORT_BEEPS },
  { remainingMs: 10 * 60000, beeps: TWO_LONG_BEEPS },
  { remainingMs: 5 * 60000, beeps: ONE_LONGER_BEEP },
];

/** マイルストーンチャイムの制御ハンドル。タイマー 1 本につき 1 インスタンス (アラームと同じく singleton)。 */
export interface TimerChime {
  /**
   * 必ずユーザージェスチャのハンドラ内から呼ぶこと (オーディオ unlock 要件)。AudioContext を resume し、
   * endMs までの締切監視を始める。arm 時点の残りを物差しの起点にするので、開始 / 再開のどちらでもこの 1 つで
   * 足り、開始済みのマイルストーンが再開で鳴り直すことはない (起点が現在の残りに揃うため)。
   */
  arm(endMs: number): void;
  /** 締切監視を止める (pause / とりけし / 完了 / モード離脱用)。チャイムは loop しないので止める音はない。 */
  disarm(): void;
  /** 全リソース解放: 監視停止・リスナ解除・AudioContext close。 */
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

  let armedEndMs: number | null = null;
  /** この run で既に鳴らした (または開始時に「過ぎた」扱いにした) マイルストーンの閾値 (ms)。各マイルストーンを
   *  ちょうど 1 回に絞る。arm のたびに作り直す (= さいかいでも現在の残り以上は鳴らさない)。 */
  const firedMilestones = new Set<number>();
  let watchIntervalId: ReturnType<typeof setInterval> | null = null;
  let disposed = false;

  /** beeps をオシレータで合成して鳴らす。背景 suspend からの復帰時は resume してから鳴らす (iOS ロック中は
   *  suspend のままなので鳴らない = 既知の制約)。各音は使い捨てのオシレータ + ゲインで、stop 後に解放される。 */
  const playChime = (beeps: readonly Beep[]): void => {
    if (disposed) return;
    const schedule = () => {
      const base = audioContext.currentTime + SCHEDULE_LEAD_SECONDS;
      for (const beep of beeps) {
        const oscillator = audioContext.createOscillator();
        const gain = audioContext.createGain();
        oscillator.frequency.value = CHIME_FREQUENCY_HZ;
        oscillator.connect(gain).connect(audioContext.destination);
        const startTime = base + beep.startOffsetSeconds;
        // 速いアタックで立ち上げ、指数減衰で「ポーン」の余韻 (exponentialRamp は 0 を取れないので 0.001 から)。
        gain.gain.setValueAtTime(0.001, startTime);
        gain.gain.exponentialRampToValueAtTime(CHIME_PEAK_GAIN, startTime + CHIME_ATTACK_SECONDS);
        gain.gain.exponentialRampToValueAtTime(0.001, startTime + beep.durationSeconds);
        oscillator.start(startTime);
        oscillator.stop(startTime + beep.durationSeconds);
      }
    };
    if (audioContext.state === "suspended") {
      audioContext.resume().then(schedule).catch((error) => {
        warn("[timer-chime] resume failed:", error);
        schedule();
      });
    } else {
      schedule();
    }
  };

  /** 残りが閾値以下になった未発火のマイルストーンを鳴らす。複数が同時に該当したら (背景凍結明け) 最も差し迫った
   *  1 つだけ鳴らし、残りも発火済みにして連発を避ける。残りは積算ではなく endMs - Date.now() を読むだけなので、
   *  interval が間引かれてもズレない。レベル判定なので prev のタイミングに依存せず、閾値を下回れば次の tick で
   *  確実に鳴る。 */
  const checkMilestones = (): void => {
    if (armedEndMs === null) return;
    const remaining = armedEndMs - Date.now();
    let toFire: readonly Beep[] | null = null;
    for (const milestone of MILESTONE_CHIMES) {
      if (remaining <= milestone.remainingMs && !firedMilestones.has(milestone.remainingMs)) {
        firedMilestones.add(milestone.remainingMs);
        toFire = milestone.beeps; // 降順なので最後に代入されるのが最小閾値 = 最も差し迫ったもの
      }
    }
    if (toFire) playChime(toFire);
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

  // アラームと違い visibilitychange / focus の復帰時照合 (reconcile) は持たない。focus や可視化のたびに起点
  // (previousRemainingMs) を現在の残りへ揃え直すと、ちょうど閾値をまたぐ前後の約 1 秒にそのリセットが挟まった
  // とき越境エッジ (prev > 閾値) が消え、その回のチャイムを取りこぼす (タイマー稼働中にウィンドウを切り替えて
  // 戻ると不安定に鳴ったり鳴らなかったりした原因)。setInterval + エッジ検出だけに任せれば前景は確実に鳴り、
  // 背景凍結明けも checkMilestones がまたいだ中の最も差し迫った 1 つを (やや遅れて) 鳴らす。締切ちょうどの
  // 発火は timer-alarm が担当するので、チャイム側に取りこぼし回収の責務はない。

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

// in-flight な init が dispose を追い越して orphan ハンドル (登録済みリスナごと) を残さないよう世代で守る。
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
