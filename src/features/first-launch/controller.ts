import { requestChronostasis } from "../../lib/chronostasis";
import { animateMotion } from "../../lib/motion";
import { deactivateFirstLaunch } from "./state";

/**
 * 初回起動演出 (はつかいきえんしゅつ) のオーケストレータ。
 *
 * Splash 分離設計: 初回起動時は ClockLayout に手を入れず、独立した FirstLaunchSplash が overlay
 * として上に被さる。下層の ClockLayout は通常通り clock モードで mount され (UI ボタン群も含む)、
 * Splash の不透明背景に隠されている。Splash が opacity フェードで消えた瞬間、下から並列時計が
 * 立ち上がる見え方になる。これにより ClockLayout / RotationActions / SettingsPopover 等は初回
 * 起動の存在を一切知らず、汚染ゼロ。
 *
 * Splash 内部は 2 画面構造 (= 2 phase):
 *   phase "single": AM/PM 両 wrapper が merged 風 transform で中央に重なり、period="merged" で
 *                   描かれて視覚上は単体時計 1 個に見える。
 *   phase "burst" : AM/PM wrapper の transform が translate(0,0) に解け、bouncy easing
 *                   (cubic-bezier(.34, 1.56, .64, 1)) で overshoot 付きで両端に押し出される。
 *                   同時に period が "am"/"pm" に切替わり、ClockLayout と同じ AM/PM 配色になる。
 *
 * 演出シーケンス (Splash の onMount で自動 kick off、pointerdown は trigger ではない):
 *   DWELL  : 静止単体時計 (phase="single") をちょっと間見せる (~700ms)。
 *   GUGUGU : shake target (= AM/PM wrapper を包む center container) に「グッ・グッ・グッ」の
 *            discrete pulse を 6 発 (~500ms)。両 wrapper が同期で揺れて単体時計が震える見え方。
 *   BURST  : phase を "burst" に切替 → AM/PM の CSS transform が bouncy で両端へ開く (620ms)。
 *            同時に shake target に scale burst (~360ms)、fade target (= container) に opacity
 *            フェード (~620ms) を WAAPI で重ねて、「ぱんっ!」と弾けて開いて消える視覚を作る。
 *   着地   : bouncy 着地まで待って deactivateFirstLaunch() → <Show> 分岐で Splash unmount、
 *            下層の ClockLayout (clock モード + split AM/PM + 現在時刻) が露出。chronostasis を
 *            解除して useCurrentTime を再開。
 *
 * 「初回」判定の永続化は state.ts に集約され、PWA install 状態を信号源とする。controller 側は
 * 純粋に演出シーケンスだけを担当する (永続フラグ操作なし、pointerdown listener なし)。
 */

/** 起動 → 単体時計を見せる dwell。短すぎると「画面開いた瞬間ガクガクする」見え方になる。 */
const DWELL_BEFORE_GUGUGU_MS = 700;
/** グッ・グッ・グッの discrete pulse duration。6 pulse × ~80ms。連続トレモロより脈動感があり
 *  「ググググ」という呻きの discrete 感に合う。 */
const GUGUGU_DURATION_MS = 500;
/** パーンッ scale burst の duration。peak は ~35% 地点で scale 1.20。BURST 開始直後に AM/PM が
 *  飛び始める瞬間にこの scale burst が乗ることで、両端への押し出しが「弾けて分かれる」感に転化する。 */
const PANG_SCALE_DURATION_MS = 360;
/** AM/PM bouncy 着地までの全長。CSS transition (cubic-bezier(.34, 1.56, .64, 1)) で overshoot が
 *  落ち着く時間。container opacity fade も同じ duration で重ねて、bouncy 着地と消失を揃える。 */
const BOUNCY_BURST_DURATION_MS = 620;

/** 「グッ・グッ・グッ」の discrete pulse 列。center → peak → center の 1 pulse をユニットに、
 *  左右交互 + 線形成長振幅で 6 発撃つ。pulse ごとに中央へ戻る瞬間があり「グッ (戻る) グッ
 *  (戻る) グッ」とリズムが数えられる脈動感になる。translate は左右に shift、rotate は逆方向に
 *  ひねって「ぐねっ」とした物理感を重ねる。 */
const buildGuguguKeyframes = (): Keyframe[] => {
  const PULSES = 6;
  const MAX_TRANSLATE_PX = 4.5;
  const MAX_ROTATE_DEG = 1.1;
  const REST = "translate(0px, 0px) rotate(0deg)";
  const frames: Keyframe[] = [{ transform: REST, offset: 0 }];
  for (let i = 0; i < PULSES; i++) {
    const ampFraction = (i + 1) / PULSES;
    const sign = i % 2 === 0 ? 1 : -1;
    const x = MAX_TRANSLATE_PX * ampFraction * sign;
    const r = MAX_ROTATE_DEG * ampFraction * -sign;
    const peakOffset = (i + 0.5) / PULSES;
    const restOffset = (i + 1) / PULSES;
    frames.push({
      transform: `translate(${x.toFixed(2)}px, 0px) rotate(${r.toFixed(2)}deg)`,
      offset: peakOffset,
    });
    frames.push({ transform: REST, offset: restOffset });
  }
  return frames;
};

/** パーンッ scale burst のキーフレーム。peak は scale(1.20) で一気に跳ね、その後 0.94 まで戻って
 *  小さくバウンドしてから 1.0 に着地。 */
const PANG_KEYFRAMES: Keyframe[] = [
  { transform: "scale(1)",    offset: 0 },
  { transform: "scale(1.20)", offset: 0.35 },
  { transform: "scale(0.94)", offset: 0.65 },
  { transform: "scale(1.04)", offset: 0.85 },
  { transform: "scale(1)",    offset: 1 },
];

/** BURST と同時に走る Splash container の opacity フェード。AM/PM の bouncy overshoot を見せる
 *  ため序盤 (offset 0.45) までは不透明維持。終盤で一気に消えて下層 ClockLayout を露出させる。 */
const SPLASH_FADE_KEYFRAMES: Keyframe[] = [
  { opacity: 1, offset: 0 },
  { opacity: 1, offset: 0.45 },
  { opacity: 0, offset: 1 },
];

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export interface SplashSequenceParams {
  /** GUGUGU の discrete pulse と PANG の scale burst を当てる element。AM/PM 両 wrapper の親で
   *  あることが前提 (両者を同時に shake / scale させたい)。 */
  shakeTarget: HTMLElement;
  /** PANG と同時に opacity フェードを当てる Splash 全面の overlay element。 */
  fadeTarget: HTMLElement;
  /** BURST に入る瞬間に呼ばれる callback。Splash 側で phase signal を "burst" に切替えて、
   *  AM/PM wrapper の CSS transition を bouncy で発火させる。 */
  onBurst: () => void;
}

/**
 * Splash の onMount から呼ぶ演出シーケンス。完了で deactivateFirstLaunch() を呼んで Splash 自身
 * を unmount させる (= 下層の ClockLayout が露出)。
 */
export const runSplashSequence = async (params: SplashSequenceParams): Promise<void> => {
  const release = requestChronostasis();
  try {
    await wait(DWELL_BEFORE_GUGUGU_MS);

    animateMotion(params.shakeTarget, buildGuguguKeyframes(), {
      duration: GUGUGU_DURATION_MS,
      easing: "linear",
      fill: "none",
    });
    await wait(GUGUGU_DURATION_MS);

    // BURST: phase 切替で AM/PM CSS transition が bouncy で発火、同時に shake target へ scale
    // burst、container へ opacity フェード。
    // 別要素 + 別プロパティ (transform vs opacity) の組み合わせなので
    // [[feedback_waapi_transform_conflict]] の同要素同時 animate 問題には抵触しない。
    params.onBurst();
    animateMotion(params.shakeTarget, PANG_KEYFRAMES, {
      duration: PANG_SCALE_DURATION_MS,
      easing: "cubic-bezier(0.22, 1, 0.36, 1)",
      fill: "none",
    });
    animateMotion(params.fadeTarget, SPLASH_FADE_KEYFRAMES, {
      duration: BOUNCY_BURST_DURATION_MS,
      easing: "ease-in",
      fill: "forwards",
    });
    await wait(BOUNCY_BURST_DURATION_MS);

    deactivateFirstLaunch();
  } finally {
    release();
  }
};
