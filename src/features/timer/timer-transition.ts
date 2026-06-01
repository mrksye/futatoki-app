import { createComputed, createEffect, createSignal, on, onCleanup } from "solid-js";
import { isTimerMode, isRotating, mergedVisible } from "../free-rotation/state";
import { animateMotion, playQuake } from "../../lib/motion";

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
/** 退室で合体時計が分離する前の「魅せ」演出 (クエイク) の長さ。timer 盤がバイバイで去っていく裏で
 *  merged がこの間ググッと震え、終わると分離 (PM 盤の生み出し) に入る。splitSide (→とけい) でのみ使う。 */
const EXIT_ANTICIPATION_MS = 360;
/** 退室で timer 盤がバイバイッと振ってフェードで去る全長 (両 kind 共通)。盤がいなくなってから
 *  exitDiverge (とけい=分離 / 回転=中央スライド) に入る。 */
const WAVE_GOODBYE_MS = 650;
/** 入りで合体時計が timer 盤を産み出す前の「魅せ」演出 (リンリン 1 回) の長さ。この間 merged が L に単独で
 *  居て鈴のように 1 回揺れ、終わると産み出し (盤の生み出しスライド) に入る。 */
export const MERGE_ANTICIPATION_MS = 280;

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

/** split の PM wrapper を L (AM の位置) まで飛ばす transform。PM wrapper は右半分なので自幅 100% ぶん
 *  寄せると AM に重なるが、AM/PM の負マージン (-mr-3/-ml-3 = 計 1.5rem) のぶん PM が左へ行き過ぎて
 *  AM の左からはみ出す。1.5rem 戻して PM を AM の真上にぴったり重ね、はみ出しをほぼゼロにする
 *  (behindLeftClockTransform と同じ補正)。 */
export const timerPmWrapperTransform = (isLandscape: boolean): string =>
  isLandscape
    ? "translateX(calc(-100% + 1.5rem)) scale(0.96)"
    : "translateY(calc(-100% + 1.5rem)) scale(0.96)";

// ── 盤を L 盤の裏から R へ出し入れするスライド (入りの timer盤 / 出りの PM盤 で共通) ──

/** R 位置の盤を L 盤の裏まで寄せる平行移動量。半盤ぶん (-50vw/-50vh) 寄せると R 盤が L 盤に重なるが、
 *  AM/PM の負マージン (-mr-3/-ml-3) のぶん R 盤が左へずれて L 盤の左からはみ出す。1.5rem 戻して R 盤を
 *  L 盤の内側 (= z 順で覆われる側) に収め、左へのはみ出しを防ぐ。z 順は R 盤 (z-auto) < L 盤 (z-10)。 */
const behindLeftClockTransform = (isLandscape: boolean): string =>
  isLandscape ? "translate(calc(-50vw + 1.5rem), 0)" : "translate(0, calc(-50vh + 1.5rem))";

/** L 盤の裏 (L) から自位置 (R) へ back-out で弾性スライド (「びよッ」と裏から生み出される)。overshoot は
 *  左収束より控えめ (1.4)。delayMs で出現を遅らせられる (入りはリンリンのぶん遅らせる)。delay 中は
 *  fill:backwards で first keyframe (behind 位置) に張り付いて待ち、スライド開始で R へ動き出す。
 *  待機中の不可視化は z 順に委ねる (盤 z-auto < 不透明な左時計 z-10): behindLeftClockTransform で左時計の
 *  円盤内へ寄せてあるうえ、タイマー盤を縮小した (TIMER_BOARD_SCALE) ので左時計の裏に隠れる。keyframe を
 *  transform 単独に保つのは visibility 等の非合成プロパティを混ぜるとアニメ全体が合成スレッドから外れ、
 *  弱 GPU で重い盤 SVG を毎フレーム再ラスタしてカクつくため (合成可能なのは transform / opacity / filter のみ)。
 *  入りの timer盤・出りの PM盤の両方で使う (同一モーション)。 */
export const playEmergeFromBehindLeft = (
  el: Element,
  isLandscape: boolean,
  delayMs = 0,
): Animation | null => {
  const behind = behindLeftClockTransform(isLandscape);
  return animateMotion(
    el,
    [{ transform: behind }, { transform: "translate(0, 0)" }],
    { duration: BOING_MS, delay: delayMs, easing: "cubic-bezier(.34, 1.4, .64, 1)", fill: "backwards" },
  );
};

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

/** merged 盤を中央 C から L 着地位置へスライド (入りの centerSlide = 回転→たいむ)。playMergedSlideToCenter
 *  の逆再生。回転からの入室は rotation merge + sky の reflow で CSS transition の baseline が奪われ盤が
 *  スナップするので、出りと対称に WAAPI で明示する。fill:backwards で開始前から C に置く。 */
export const playMergedSlideFromCenter = (el: Element, isLandscape: boolean): Animation | null => {
  const atLeft = isLandscape ? "translateX(-25%)" : "translateY(-25%)";
  return animateMotion(
    el,
    [{ transform: "translate(0, 0) scale(1)" }, { transform: `${atLeft} scale(1)` }],
    { duration: CONVERGE_MS, easing: "cubic-bezier(.4, 0, .2, 1)", fill: "backwards" },
  );
};

/** 「リンッ」: 鈴をチリンと鳴らすような揺れ 1 回。上部頂点を支点 (transform-origin: 50% 0%) に弧を描く
 *  横振りで、damped に振り戻して止まる。merged が timer 盤を産み出す前の「魅せ」。
 *  あとで別演出 (ジャンプ等) にすげ替える可能性があるので、産み出し前演出の実装点はこの 1 関数に閉じる
 *  (呼び出し側は playMergeAnticipation という意図名だけを使う)。支点は要素へ直接セットし keyframe は
 *  transform 単独に保つ: transform-origin は合成可能プロパティ (transform / opacity / filter) でなく、
 *  keyframe に混ぜるとアニメ全体が合成スレッドから外れ、弱 GPU で重い盤 SVG を毎フレーム再ラスタして
 *  カクつく。 */
const RIN_RIN_KEYFRAMES: Keyframe[] = [
  { transform: "rotate(0deg)", offset: 0 },
  { transform: "rotate(6deg)", offset: 0.32 },
  { transform: "rotate(-3deg)", offset: 0.62 },
  { transform: "rotate(1deg)", offset: 0.84 },
  { transform: "rotate(0deg)", offset: 1 },
];
export const playMergeAnticipation = (el: Element): Animation | null => {
  (el as HTMLElement).style.transformOrigin = "50% 0%";
  return animateMotion(el, RIN_RIN_KEYFRAMES, { duration: MERGE_ANTICIPATION_MS, easing: "ease-out", fill: "none" });
};

/** 退室 (たいむ→とけい) の「魅せ」: timer 盤がバイバイで去っていく裏で、merged が「勝手に」自己分裂する
 *  前にググッとクエイクする。バイバイから少しズラして始める (WAVE_GOODBYE_MS の末尾でクエイクが終わり、
 *  そのまま分離 = PM 盤の生み出しへ繋がる) ため delay を入れる。すげ替えられるよう実装点はこの 1 関数に閉じる。
 *  はつかいき splash の「ググググーッ」(playQuake) を共通利用 (時計サイズ向けに振幅を上げる)。 */
const SPLIT_QUAKE_AMPLITUDE_SCALE = 2.6;
export const playSplitAnticipation = (el: Element): Animation | null =>
  // 支点は playQuake が center に戻す (入りのリンリンが 50% 0% を残していてもクエイクは中央支点で回る)。
  playQuake(el, EXIT_ANTICIPATION_MS, WAVE_GOODBYE_MS - EXIT_ANTICIPATION_MS, SPLIT_QUAKE_AMPLITUDE_SCALE);

/** 退室で timer 盤が去るときの「バイバイッ」(両 kind 共通)。右下を支点 (transform-origin: 100% 100%) に
 *  弧を描いて素早く 2 回振り、最後にフェード+縮小で消える。回転モードには連れて行かれず、とけいでも合体時計
 *  には吸収されない盤のお別れ演出。fill:forwards で消えたまま保持 (直後に unmount)。実装点はこの 1 関数に閉じる。
 *  支点は要素へ直接セットし keyframe は transform / opacity (合成可能) だけに保つ (リンリンと同理由)。 */
const WAVE_GOODBYE_KEYFRAMES: Keyframe[] = [
  { transform: "rotate(0deg) scale(1)", opacity: 1, offset: 0 },
  { transform: "rotate(-2deg) scale(1)", offset: 0.16 },
  { transform: "rotate(1deg) scale(1)", offset: 0.36 },
  { transform: "rotate(-0.5deg) scale(1)", offset: 0.54 },
  { transform: "rotate(0deg) scale(1)", opacity: 1, offset: 0.64 },
  { transform: "rotate(0deg) scale(0.35)", opacity: 0, offset: 1 },
];
export const playWaveGoodbye = (el: Element): Animation | null => {
  (el as HTMLElement).style.transformOrigin = "100% 100%";
  return animateMotion(el, WAVE_GOODBYE_KEYFRAMES, { duration: WAVE_GOODBYE_MS, easing: "ease-in-out", fill: "forwards" });
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
        // enterBoing = リンリン (merged が鈴で timer 盤を呼び出す魅せ) + 盤の生み出しスライド。
        // 盤の生み出しは MERGE_ANTICIPATION_MS だけ遅延して走る (下流 TimerLayout)。
        after(CONVERGE_MS + MERGE_ANTICIPATION_MS + BOING_MS, () => setPhase("idle"));
      } else {
        // 退室先が回転モードなら中央 merged 着地 (centerSlide)、clock なら split 着地 (splitSide)。
        const exitKind: TimerTransitionKind = isRotating() ? "centerSlide" : "splitSide";
        setKind(exitKind);
        setMergedRevealed(true);
        setPhase("exitBoing");
        // exitBoing: 両 kind とも timer 盤がバイバイッと振ってフェードで去る (WAVE_GOODBYE)。splitSide では
        //            その裏で merged がちょっとズレて自己分裂のクエイクをする (TimerLayout 側)。
        const exitBoingMs = WAVE_GOODBYE_MS;
        // exitDiverge: splitSide は PM 盤の生み出し (BOING)、centerSlide は merged の中央スライド (CONVERGE)。
        const divergeMs = exitKind === "centerSlide" ? CONVERGE_MS : BOING_MS;
        after(exitBoingMs, () => setPhase("exitDiverge"));
        after(exitBoingMs + divergeMs, () => {
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
