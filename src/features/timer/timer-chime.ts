import { createSignal } from "solid-js";
import { isIosLike } from "./timer-alarm";

/**
 * カウントダウンの残り時間を知らせるマイルストーンチャイム (残り 15 分 / 10 分 / 5 分の「ポーン」音)。
 * 完了アラーム (timer-alarm.ts) とは責務を分けた独立モジュールで、こちらは締切「前」の予告だけを扱う。
 * アラームが loop 再生する m4a 音源なのに対し、チャイムは Web Audio のオシレータでその場合成する短い音
 * (アセット不要、self-contained)。残り分ごとに鳴らし分ける:
 *
 *   - 残り 15 分: ポンポンポン (短い音を 3 つ。まだ余裕があるので軽やかに)
 *   - 残り 10 分: ポーンポーン (伸ばした音を 2 つ)
 *   - 残り  5 分: ポーーン     (いちばん長く伸ばした音を 1 つ。もうすぐ終わりの合図)
 *
 * 計時はアラームと同じ哲学で「回すのは setInterval、測るのは Date.now()」。interval が発火した回数を積算
 * すると、背景タブで throttle されたときに発火回数が減って実時間より経過が少なく見積もられ予告がズレるので、
 * 発火回数は数えず watch の中で remaining = endMs - Date.now() を物差しとして読むだけにする (コストはほぼ 0)。
 * 鳴らすかどうかは「残りが閾値をまたいで初めて閾値以下に落ちた瞬間」というエッジで判定する (level ではなく
 * 越境で数えるので各マイルストーンはちょうど 1 回鳴り、開始時点で残り = 総時間と等しい閾値は鳴らさない =
 * 例えば 15 分タイマーは開始直後に残り 15 分チャイムを鳴らさず、10 分と 5 分だけ鳴らす)。
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

/** 余韻の長さ (秒)。「ポン」= 短い、「ポーン」= 中、「ポーーン」= 長い。「ン」を伸ばす長さの差になる。 */
const SHORT_BEEP_SECONDS = 0.13;
const LONG_BEEP_SECONDS = 0.45;
const LONGER_BEEP_SECONDS = 0.9;

/** 連続する音の onset 間隔 (前の音が鳴り始めてから次が鳴り始めるまでの秒)。余韻より長くして粒を分ける。 */
const SHORT_GAP_SECONDS = 0.22;
const LONG_GAP_SECONDS = 0.6;

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

/** 残り 10 分: ポーンポーン。 */
const TWO_LONG_BEEPS: readonly Beep[] = [
  { startOffsetSeconds: 0, durationSeconds: LONG_BEEP_SECONDS },
  { startOffsetSeconds: LONG_GAP_SECONDS, durationSeconds: LONG_BEEP_SECONDS },
];

/** 残り 5 分: ポーーン。 */
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
  /** 直前の watch で読んだ残り (ms)。越境エッジ (prev > 閾値 かつ now <= 閾値) の検出に使う。 */
  let previousRemainingMs = 0;
  let watchIntervalId: ReturnType<typeof setInterval> | null = null;
  let disposed = false;

  /** beeps をオシレータで合成して鳴らす。背景 suspend からの復帰時は resume してから鳴らす (iOS ロック中は
   *  suspend のままなので鳴らない = 既知の制約)。各音は使い捨てのオシレータ + ゲインで、stop 後に解放される。 */
  const playChime = (beeps: readonly Beep[]): void => {
    if (disposed) return;
    const schedule = () => {
      const base = audioContext.currentTime;
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

  /** 残りが閾値を初めて下回ったマイルストーンを鳴らす。複数同時に越境していたら (背景凍結明け) 最も差し迫った
   *  1 つだけ鳴らし、残りは黙って既越扱いにする (古い予告の連発を避ける)。残りは積算ではなく endMs - Date.now()
   *  を読むだけなので、interval が間引かれてもズレない。 */
  const checkMilestones = (): void => {
    if (armedEndMs === null) return;
    const remaining = armedEndMs - Date.now();
    let crossed: readonly Beep[] | null = null;
    for (const milestone of MILESTONE_CHIMES) {
      if (previousRemainingMs > milestone.remainingMs && remaining <= milestone.remainingMs) {
        crossed = milestone.beeps; // 降順なので最後に上書きされるのが最小閾値 = 最も差し迫ったもの
      }
    }
    previousRemainingMs = remaining;
    if (crossed) playChime(crossed);
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
    // 現在の残りを物差しの起点にする。これにより越境エッジ (prev > 閾値) は arm 後に初めて残りが減ったときだけ
    // 成立し、開始 / 再開時点で既に閾値以下の (= もう過ぎた) マイルストーンは鳴り直さない。
    previousRemainingMs = endMs - Date.now();
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
