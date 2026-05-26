import { createComputed, createEffect, createSignal, on, onCleanup } from "solid-js";
import { isTimerMode, isRotating, mergedVisible } from "../free-rotation/state";
import { animateMotion } from "../../lib/motion";

/**
 * たいむモードへの出入りトランジションの振り付け。回転モードの合体/分離 (merge-animation.ts) とは別軸で、
 * 「2 盤レイアウト ⇄ たいむレイアウト」の遷移だけを司る。merge-animation と同じ設計言語 (560ms / 同 CSS
 * クラス / scale-reveal) を共有するが、回転の機構そのものには手を入れず独立させてある。
 *
 * 状態は module-level の共有 signal で持つ (state.ts と同流儀)。ClockLayout の clock/rotate ツリーと
 * TimerLayout の双方が同じ phase を読む必要があるため。effect 配線 (フェーズ送り) は useTimerTransition()
 * を ClockLayout で 1 回呼んで仕込む。
 *
 * 幾何の前提: split の AM/PM 盤と たいむの 2 盤は同じ L(=左/上 25%) / R(=右/下 75%) 位置に座る。回転
 * かさねの merged 盤だけが中央 C(=50%)。よって遷移は次の 3 サブモーションの合成で表せる:
 *   - boing      : たいむ盤 (R) が「びよっ」と出入りする (全経路共通)。
 *   - splitSide  : split の 2 盤が L で合体/分離する (PM が L⇄R を飛ぶ。clock / rotate-split 由来)。
 *   - centerSlide: 中央 C の merged 盤が L⇄C をサッと移動する (rotate-merged 由来)。
 *
 * 振り付け (位置 L / C / R):
 *   入る  splitSide  : PM が R→L へ寄り AM と合体 (merged が L 着地) → たいむ盤 R で boing-in
 *   入る  centerSlide: 中央 merged が C→L へスライド → たいむ盤 R で boing-in
 *   出る  splitSide  : たいむ盤 R で boing-out → L の merged が split 着地 (AM/PM が現れる)
 *   出る  centerSlide: たいむ盤 R で boing-out → L の merged が L→C へスライド (中央 merged で着地)
 *
 * 二つの描画ツリーは遷移中だけ重ねてマウントし、L の merged 盤 (現在時刻・同一表示) を継ぎ目にして
 * 受け渡す。収束/発散フェーズは clock ツリーが L の盤を描き、boing フェーズは TimerLayout が引き継ぐ。
 * 受け渡し位置・内容が一致するのでクロスフェードなしでも継ぎ目は見えない。
 */

/**
 * 遷移フェーズ。enter / exit でそれぞれ「収束 (converge) / 発散 (diverge)」→「たいむ盤 boing」の 2 段。
 *   idle          : 遷移していない (clock / rotate / timer の定常)。
 *   enterConverge : L へ収束中 (splitSide=合体 / centerSlide=スライド)。clock ツリーが L の盤を描く。
 *   enterBoing    : たいむ盤を boing-in 中。TimerLayout が L の盤を引き継ぐ。
 *   exitBoing     : たいむ盤を boing-out 中。まだ TimerLayout が L の盤を描く。
 *   exitDiverge   : L から発散中 (splitSide=分離 / centerSlide=スライド)。clock ツリーが L の盤を描く。
 */
export type TimerTransitionPhase =
  | "idle"
  | "enterConverge"
  | "enterBoing"
  | "exitBoing"
  | "exitDiverge";

/** 収束/発散の形。splitSide=2 盤の合体/分離、centerSlide=中央 merged の L⇄C スライド。 */
export type TimerTransitionKind = "splitSide" | "centerSlide";

/** 収束/発散にかける時間。回転合体 (clock-wrapper-transition / clock-merged-container-transition) と揃える。 */
const CONVERGE_MS = 560;
/** たいむ盤の boing (びよっ) 時間。 */
const BOING_MS = 440;

const [phase, setPhase] = createSignal<TimerTransitionPhase>("idle");
const [kind, setKind] = createSignal<TimerTransitionKind>("splitSide");
/** merged 盤の scale-reveal (centerSlide では未使用。将来の splitSide 着地演出用に保持)。 */
const [mergedRevealed, setMergedRevealed] = createSignal(true);
/** TimerLayout をマウントしてよいか。入室時は wrapper の合体スライドの transition baseline を TimerLayout の
 *  mount reflow (timer-background の gradient div 等) に奪われないよう、double rAF で 1 paint 遅らせてから
 *  mount する (兄弟 mount reflow が transition を殺す既知の罠の対策)。退室中は保持し、idle 復帰で落とす。 */
const [timerLayoutMounted, setTimerLayoutMounted] = createSignal(false);

export {
  phase as timerTransitionPhase,
  kind as timerTransitionKind,
  mergedRevealed as timerMergedRevealed,
};

// ── ClockLayout / TimerLayout が読む派生フラグ (条件分岐をここに集約して呼び出し側を平易に保つ) ──

export const timerTransitioning = () => phase() !== "idle";

/** clock/rotate ツリーを DOM に保持し続ける (常時 true)。たいむ中も unmount せず display で隠す
 *  (clockTreeShowsClocks)。毎サイクル重い盤 SVG を作り直すと生成/破棄コストとラスタ再生成で徐々に重く
 *  なるため、生成は一度きりにして使い回す。可視制御は clockTreeShowsClocks に委ねる。 */
export const clockTreeMounted = () => true;
/** TimerLayout をマウントするか。入室時は double rAF 遅延 (上記 timerLayoutMounted)、退室は idle まで保持。 */
export const timerTreeMounted = () => timerLayoutMounted();

/** clock/rotate ツリーが「時計そのもの (wrapper / merged)」を描くフェーズか。boing 中は TimerLayout が
 *  L の盤を引き継ぐので clock ツリー側の時計は描かない (定常 clock/rotate と収束/発散のみ)。 */
export const clockTreeShowsClocks = () =>
  phase() === "idle" ? !isTimerMode() : phase() === "enterConverge" || phase() === "exitDiverge";

/** clock ツリーが L の merged 盤 (container) を描くフェーズ。centerSlide の収束/発散だけ
 *  (中央 merged を L⇄C へスライドさせる)。splitSide は wrapper の PM スライドそのものが「合体」の見せ場で、
 *  重い merged container を同フレームに fresh mount すると reflow で wrapper のスライド transition の
 *  baseline を奪う (既知の罠) ため使わない。splitSide の L 盤は boing フェーズで TimerLayout が出す。 */
export const clockShowsMergedAtLeft = () =>
  (phase() === "enterConverge" || phase() === "exitDiverge") && kind() === "centerSlide";

/** split wrapper が動くフェーズか (splitSide の収束/発散のみ。centerSlide は merged だけ動く)。 */
export const timerWrappersActive = () =>
  (phase() === "enterConverge" || phase() === "exitDiverge") && kind() === "splitSide";

/** PM wrapper を L へ飛ばすフェーズか (splitSide の入り収束のみ。出り発散では PM は R に戻る = 既定 transform)。 */
export const timerPmConvergingLeft = () => phase() === "enterConverge" && kind() === "splitSide";

/** merged 盤が L 着地状態か。入り/boing は L、出り発散 (centerSlide) だけ C へ戻す。 */
export const timerMergedAtLeft = () => phase() !== "exitDiverge";

/** TimerLayout が L の merged 盤 (現在時刻) を描くフェーズか。収束/発散中は clock ツリーが描くので隠す。 */
export const timerShowsLeftFace = () =>
  phase() === "enterBoing" || phase() === "exitBoing" || (phase() === "idle" && isTimerMode());

/** たいむ盤 (R) を収束/発散側で隠すか (enterConverge の boing 前 / exitDiverge の boing 後)。 */
export const timerBoardHidden = () => phase() === "enterConverge" || phase() === "exitDiverge";

// ── transform helpers (ClockLayout の merged container / PM wrapper の inline transform に使う) ──

/** merged container を L (たいむの AM 位置) に寄せる平行移動量。全幅 absolute の中身を画面 1/4 ぶん寄せると
 *  中央 C(50%) から L(25%) に来る。landscape は横、portrait は縦。 */
export const timerMergedTransform = (atLeft: boolean, revealed: boolean, isLandscape: boolean): string => {
  const translate = atLeft ? (isLandscape ? "translateX(-25%)" : "translateY(-25%)") : "translate(0, 0)";
  return `${translate} ${revealed ? "scale(1)" : "scale(0.85)"}`;
};

/** split の PM wrapper を L (AM の位置) まで飛ばす transform。PM wrapper は右半分なので自幅 100% ぶん。 */
export const timerPmWrapperTransform = (isLandscape: boolean): string =>
  isLandscape ? "translateX(-100%) scale(0.96)" : "translateY(-100%) scale(0.96)";

// ── 盤を L 盤の裏から R へ出し入れするスライド (入りの timer盤 / 出りの PM盤 で共通) ──

/** R 位置の盤を L 盤の裏まで寄せる平行移動量。R 中心(75%)→L 中心(25%) = 画面 1/2 ぶん。盤自身の幅は
 *  clockSize で可変なので、確実に L へ重ねるため viewport 基準 (vw/vh) で寄せる。z 順は R 盤 (z-auto) <
 *  L 盤 (z-10) なので、ここに居る間は L 盤の裏に隠れる。 */
const behindLeftClockTransform = (isLandscape: boolean): string =>
  isLandscape ? "translateX(-50vw)" : "translateY(-50vh)";

/** L 盤の裏 (L) から自位置 (R) へ back-out で弾性スライド (「びよッ」と裏から生み出される)。overshoot は
 *  左収束より控えめ (1.4)。fill:backwards で開始前から裏位置に置きチラ見え防止。入りの timer盤・出りの
 *  PM盤の両方で使う (同一モーション)。 */
export const playEmergeFromBehindLeft = (el: Element, isLandscape: boolean): Animation | null =>
  animateMotion(
    el,
    [{ transform: behindLeftClockTransform(isLandscape) }, { transform: "translate(0, 0)" }],
    { duration: BOING_MS, easing: "cubic-bezier(.34, 1.4, .64, 1)", fill: "backwards" },
  );

/** 自位置 (R) から L 盤の裏 (L) へ ease-in でスッと退く。fill:forwards で裏に隠れたまま保持 (直後に
 *  unmount される)。出りの timer盤で使う。 */
export const playRetreatBehindLeft = (el: Element, isLandscape: boolean): Animation | null =>
  animateMotion(
    el,
    [{ transform: "translate(0, 0)" }, { transform: behindLeftClockTransform(isLandscape) }],
    { duration: BOING_MS, easing: "cubic-bezier(.4, 0, .7, 1)", fill: "forwards" },
  );

/** merged 盤を L 着地位置から中央 C へスライド (出りの centerSlide = たいむ→回転)。L は container 全幅の
 *  1/4 ぶん寄せた位置 (timerMergedTransform と同じ)、C は無変位。fill:backwards で開始前から L に置く。 */
export const playMergedSlideToCenter = (el: Element, isLandscape: boolean): Animation | null => {
  const atLeft = isLandscape ? "translateX(-25%)" : "translateY(-25%)";
  return animateMotion(
    el,
    [{ transform: `${atLeft} scale(1)` }, { transform: "translate(0, 0) scale(1)" }],
    { duration: CONVERGE_MS, easing: "cubic-bezier(.4, 0, .2, 1)", fill: "backwards" },
  );
};

/**
 * 遷移フェーズを送る effect 配線。ClockLayout から 1 回だけ呼ぶ。phase / kind / mergedRevealed の
 * module-level signal を駆動する。
 */
export const useTimerTransition = () => {
  let stepTimers: ReturnType<typeof setTimeout>[] = [];
  const clearSteps = () => {
    stepTimers.forEach(clearTimeout);
    stepTimers = [];
  };
  const after = (ms: number, fn: () => void) => {
    stepTimers.push(setTimeout(fn, ms));
  };

  // 入室時の TimerLayout mount を double rAF で 1 paint 遅らせる。wrapper の合体スライド (clock ツリー側) の
  // transition を先に発火させ、TimerLayout の mount reflow (timer-background の gradient div 等) に
  // baseline を奪われないようにする (兄弟 mount reflow が transition を殺す既知の罠の対策)。
  let mountRaf1: number | null = null;
  let mountRaf2: number | null = null;
  const cancelMountDelay = () => {
    if (mountRaf1 !== null) { cancelAnimationFrame(mountRaf1); mountRaf1 = null; }
    if (mountRaf2 !== null) { cancelAnimationFrame(mountRaf2); mountRaf2 = null; }
  };
  const scheduleTimerMount = () => {
    cancelMountDelay();
    mountRaf1 = requestAnimationFrame(() => {
      mountRaf1 = null;
      mountRaf2 = requestAnimationFrame(() => {
        mountRaf2 = null;
        setTimerLayoutMounted(true);
      });
    });
  };

  // たいむに入る直前の「中央かさね表示だったか」を覚えておく。たいむ中 (isTimerMode) は更新しないので、
  // 入室エッジが立った時点でも入室前の値を保持している = 収束の形 (splitSide / centerSlide) を判定できる。
  let enteredFromMergedCenter = false;
  createEffect(() => {
    if (!isTimerMode()) enteredFromMergedCenter = mergedVisible();
  });

  // phase の起点は createComputed で立てる: isTimerMode が切り替わった瞬間に (render より前の同期段階で)
  // enterConverge / exitBoing へ移す。createEffect / createRenderEffect だと「isTimerMode=true かつ
  // phase=idle」の 1 フレームを mount 条件 (clockTreeMounted 等) が拾い、clock ツリーが一旦 unmount→再 mount
  // して wrapper の合体スライドが fresh-mount 化し死ぬ。createComputed は render effect より前に走るので
  // mount 条件が評価される時点で phase は確定している。
  createComputed(
    on(isTimerMode, (isTimer, wasTimer) => {
      if (wasTimer === undefined) return;
      if (isTimer === wasTimer) return;
      clearSteps();
      cancelMountDelay();
      if (isTimer) {
        setKind(enteredFromMergedCenter ? "centerSlide" : "splitSide");
        setMergedRevealed(true);
        setPhase("enterConverge");
        // clock ツリーの合体スライドを先に 1 paint 走らせてから TimerLayout を mount。
        scheduleTimerMount();
        after(CONVERGE_MS, () => setPhase("enterBoing"));
        after(CONVERGE_MS + BOING_MS, () => setPhase("idle"));
      } else {
        // 退室先が回転モードなら中央 merged 着地 (centerSlide)、clock なら split 着地 (splitSide)。
        setKind(isRotating() ? "centerSlide" : "splitSide");
        setMergedRevealed(true);
        setPhase("exitBoing");
        after(BOING_MS, () => setPhase("exitDiverge"));
        after(BOING_MS + CONVERGE_MS, () => {
          setPhase("idle");
          setTimerLayoutMounted(false); // 退室完了で TimerLayout を unmount
        });
      }
    }),
  );

  onCleanup(() => {
    clearSteps();
    cancelMountDelay();
  });
};
