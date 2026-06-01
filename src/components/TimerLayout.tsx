import { createEffect, createMemo, createSignal, on, onCleanup, Show, type Component } from "solid-js";
import ClockFace from "./clockface-layers/ClockFace";
import HandsLayer from "./clockface-layers/HandsLayer";
import TimerWedge from "../features/timer/TimerWedge";
import { useOrientation } from "../hooks/useOrientation";
import { useViewport } from "../hooks/useViewport";
import { useI18n } from "../i18n";
import { colorMode } from "../features/settings/color-mode";
import { paletteId } from "../features/settings/palette";
import {
  timerPhase,
  selectedMinutes,
  runStartMs,
  pausedRemainingMs,
  completeTimer,
} from "../features/timer/state";
import { timerAlarm } from "../features/timer/timer-alarm";
import { timerChime } from "../features/timer/timer-chime";
import { nowHandStyle, overrunHandColor } from "../features/timer/timer-hand-style";
import {
  timerTransitionPhase,
  timerTransitionKind,
  timerShowsLeftFace,
  timerBoardHidden,
  playEmergeFromBehindLeft,
  playMergeAnticipation,
  playSplitAnticipation,
  playWaveGoodbye,
  MERGE_ANTICIPATION_MS,
} from "../features/timer/timer-transition";

/**
 * 分タイマーモードの表示レイヤー。clock / 回転モードの表示ツリー (ClockLayout) とは排他で、回転
 * machinery (drag / wheel / merge animation / AM/PM selection dim) を一切持たない独立コンポーネント。
 * 合体時計 (ClockFace period="merged") とその針 (HandsLayer) を視覚流用するだけで状態は共有しない。
 * 操作 (せっと / すたーと / とりけし / リングメニュー) は TimerActions が担当し、本ファイルは
 * timer/state の signal を読んで「見せる」だけ。
 *
 * 左の合体時計 (AM 位置) の時刻はモード入室から 250ms ごとに live で進み続け、done になっても止めない
 * (タイマーが鳴り終わっても現在時刻はずっと進む)。setup 中 (unset / picking) も止めない。
 * リングで分を選ぶと即 running に入り、タイマー盤 (PM 位置) では開始時刻 (runStartMs) 基準の固定マーカーへ
 * 向けて現在針が進む。現在針がマーカーに重なった (終了時刻に到達した) ところでタイマー盤だけが終了時刻に
 * 凍結する = 鳴り終わりに現在針が終了マーカーちょうどに重なって止まる。
 *
 * 盤面の役割:
 *  - AM 位置 (landscape 左 / portrait 上): 現在時刻の合体時計 (通常の黒針)。
 *  - PM 位置 (landscape 右 / portrait 下): タイマー盤。グレーの現在針 (長針 ghost) + 黒い終了マーカー針
 *    (markerMinutes, タイマーの目標)。終了マーカーは分を選んだ瞬間 (= 即 running) から出て固定。
 *    現在針がそこへ近づき、重なったら終了。短針 (時針) はマーカーを出さない (分タイマーなので無視)。
 */

/** 完了時のバイブパターン (対応端末のみ。iOS Safari は Vibration API 非対応なので実質 Android 向け)。 */
const ALARM_VIBRATE_PATTERN = [200, 100, 200];

/** 表示更新 (針 SVG 再描画) の最小間隔。針はゆっくり動くので 4fps で十分、弱 GPU の負荷を抑える。 */
const DISPLAY_TICK_MS = 250;

/** タイマー盤だけ AM 位置の合体時計より一回り小さく見せる縮小率。両盤面とも clockSize() を基準寸法に
 *  取るが、タイマー盤にはこの率を掛けて少し小ぶりにする (懐中時計のような佇まい)。盤は半盤の中央寄せ
 *  なので、生み出しスライド (translate(-50vw...) で中心同士を合わせる) は縮小しても AM 盤の内側に収まる。 */
const TIMER_BOARD_SCALE = 0.88;

const TimerLayout: Component = () => {
  const isLandscape = useOrientation();
  const viewport = useViewport();
  const { formatNumeral } = useI18n();

  // timer モード中ずっと 250ms ごとに更新する現在時刻。両盤面の針はこれを基準に live で進む。
  const [nowMs, setNowMs] = createSignal(Date.now());

  const refDate = createMemo(() => new Date(nowMs()));
  const refHours = () => refDate().getHours();
  /** 秒も混ぜた分 (小数) → running 中の現在針がカクつかず滑らかに進む。 */
  const refMinuteFloat = () => refDate().getMinutes() + refDate().getSeconds() / 60;

  const hasSelection = () =>
    timerPhase() === "running" || timerPhase() === "paused" || timerPhase() === "done";

  /** カウントダウン終了時刻 (ms)。
   *  - running / done: 開始押下時刻 (runStartMs) 基準で固定 (done は nowMs を完了時刻に clamp 済みなので
   *    現在針と重なる)。
   *  - paused: 現在時刻 + 凍結した残り → 時計が進むとマーカーも一緒に動き、扇 (残り) の幅は一定に保つ。
   *  - unset / picking (sel=null): null。 */
  const endMs = (): number | null => {
    const sel = selectedMinutes();
    if (sel === null) return null;
    if (timerPhase() === "running" || timerPhase() === "done") {
      const start = runStartMs();
      return start === null ? null : start + sel * 60000;
    }
    if (timerPhase() === "paused") {
      const rem = pausedRemainingMs();
      return rem === null ? null : nowMs() + rem;
    }
    return null;
  };

  /** タイマー盤 (PM 位置) の基準時刻。running / paused は live の現在時刻、done は終了時刻で凍結する。
   *  左の合体時計 (AM 位置) は refDate (live の nowMs) のまま進み続けるが、タイマー盤の針・扇だけは
   *  この boardDate を読むことで終了位置にとどまる (鳴り終わりに現在針が終了マーカーへ重なって止まる)。 */
  const boardDate = createMemo(() => {
    if (timerPhase() === "done") {
      const e = endMs();
      if (e !== null) return new Date(e);
    }
    return refDate();
  });
  const boardHours = () => boardDate().getHours();
  const boardMinuteFloat = () => boardDate().getMinutes() + boardDate().getSeconds() / 60;

  /** 終了マーカー針の位置 (分, 小数)。選択済み (running / paused / done) のときだけ値を返す。 */
  const markerMinutes = (): number | undefined => {
    if (!hasSelection()) return undefined;
    const e = endMs();
    if (e === null) return undefined;
    const d = new Date(e);
    return d.getMinutes() + d.getSeconds() / 60;
  };

  /** done のとき live 現在時刻に追従して動く「経過オーバーラン針」の位置 (分, 小数)。終了時刻で凍る
   *  marker (黒) と ghost grey の重なりから離れて進むことで、子供と一緒に「もう X 分過ぎてるで」を
   *  視覚的に共有できる。done 以外は undefined で HandsLayer 側で描画スキップ。 */
  const overrunMinutes = (): number | undefined =>
    timerPhase() === "done" ? refMinuteFloat() : undefined;

  /** 盤面に色扇が乗る sector 表示か (非ものとーんのくぎり)。針の色を盤面背景に合わせて出し分けるための判定で、
   *  色そのものの決定は timer-hand-style に委ねる (ここは渡す boolean を作るだけ)。 */
  const isSectorBoard = () => colorMode() === "sector" && paletteId() !== "monotone";

  /** 残り秒。running=実時間で減る / paused=凍結した残り / done=0。 */
  const remainingSeconds = (): number | null => {
    const sel = selectedMinutes();
    if (sel === null) return null;
    if (timerPhase() === "done") return 0;
    if (timerPhase() === "paused") {
      const rem = pausedRemainingMs();
      return rem === null ? null : Math.ceil(rem / 1000);
    }
    if (timerPhase() === "running") {
      const e = endMs();
      return e === null ? null : Math.max(0, Math.ceil((e - nowMs()) / 1000));
    }
    return null;
  };

  /** 残り分 (扇の角度幅のもと)。remainingSeconds と同じ真実を分換算しただけ。 */
  const remainingMinutes = (): number => (remainingSeconds() ?? 0) / 60;

  /** 到達済み分 (開始点→現在針)。残り扇とちょうど隣り合うよう selectedMinutes から残り分を引いて出す
   *  (独立計算だと丸めで現在針の継ぎ目に隙間/重なりが出る)。done では sel 全部 = 開始点から終了マーカー
   *  までの全域が到達済み扇になる。 */
  const elapsedMinutes = (): number => {
    const sel = selectedMinutes();
    if (sel === null) return 0;
    return Math.max(0, sel - remainingMinutes());
  };

  /** 終了マーカーの分位置 (連続値, 60 超も可)。2 本の扇のグラデ濃端をここに揃えて 1 枚に見せる。
   *  boardMinuteFloat は wrap した 0..60 だが、扇は分×6° で角度化するので連続値のまま渡してよい。 */
  const markerMinuteContinuous = (): number => boardMinuteFloat() + remainingMinutes();

  /** 一時停止のドリフトを示す青背景 (開始基準の分位置 + 選択分)。一時停止中だけ出す。
   *  仕組み: 開始 (runStartMs) から選択分ぶんの青扇を盤の最背面に固定で敷く。一時停止は残り時間を凍らせるが
   *  現在針も終了マーカーも実時刻で進み続ける = 不透明な赤い弧 (到達済み+残り) ごと盤上を前へドリフトする。
   *  青は固定なので、赤がどいた後端 (開始側) に青が覗く = それが停止中に過ぎた実時間。動的計算は要らず
   *  幾何で出る。背景は runStartMs(= 保存 endMs から逆算、復元後も正しい) と選択分だけで決まるので、アプリ
   *  再起動をまたいでも now 依存で膨らまない。分位置ベース + バンド分割なので幅は自然に 1 周 (60 分) で頭打ち
   *  (時刻指定で 60 分超の選択も、フラット青の重ね塗りになるだけで破綻しない)。 */
  const pauseDrift = (): { from: number; span: number } | null => {
    if (timerPhase() !== "paused") return null;
    const start = runStartMs();
    const sel = selectedMinutes();
    if (start === null || sel === null) return null;
    const d = new Date(start);
    return { from: d.getMinutes() + d.getSeconds() / 60, span: sel };
  };

  /** ロケール数字で 2 桁ゼロ埋め (formatNumeral は桁数を保たないので 1 桁は zero glyph を前置)。 */
  const pad2 = (v: number) => (v < 10 ? formatNumeral(0) + formatNumeral(v) : formatNumeral(v));
  const digital = (): string | null => {
    const r = remainingSeconds();
    if (r === null) return null;
    return `${pad2(Math.floor(r / 60))}:${pad2(r % 60)}`;
  };

  // timer モード中は全フェーズで requestAnimationFrame を回し、現在時刻 (nowMs) を取り直して左の合体時計を
  // live で進める。setInterval ではなく rAF なのは、背景タブでは自動的に止まり計時を無駄に進めないため。
  // 計時の真実は endMs - Date.now() のままで、rAF は表示専用 (値の積算はしない)。running 中に終了時刻へ
  // 達したら done へ遷移してアラームを鳴らす (フォアグラウンド発火経路)。画面消灯下の発火と復帰時の
  // 取りこぼし回収は timer-alarm 側の setInterval 監視 (keepalive がページを生かす) と visibilitychange
  // 照合が担当する。done でも nowMs は進み続け左の合体時計は止めない。終了位置で凍るのはタイマー盤だけで、
  // それは boardDate が done のとき終了時刻を返すことで実現する (この effect は時刻ソースを止めない)。
  createEffect(() => {
    const phase = timerPhase();
    let animationFrameId = 0;
    // 表示の commit (setNowMs → 針 SVG 再描画) は 4fps に間引く。針はゆっくり動くので 60fps は不要で、
    // 毎フレーム再描画すると弱 GPU を圧迫する。rAF ループ自体は前景のみで回り (背景タブで自動停止)、
    // running の完了判定は毎フレーム精度のまま (now >= endMs を間引かず見る)。
    let lastCommitMs = 0;
    const tick = () => {
      const now = Date.now();
      if (phase === "running") {
        const e = endMs();
        if (e !== null && now >= e) {
          setNowMs(now);
          completeTimer();
          timerAlarm()?.ensureAlarmPlaying();
          // 締切に達したので予告チャイムの watch は用済み。止めて遊休 interval を残さない (鳴っている音は無い)。
          timerChime()?.disarm();
          if (typeof navigator.vibrate === "function") navigator.vibrate(ALARM_VIBRATE_PATTERN);
          return;
        }
      }
      if (now - lastCommitMs >= DISPLAY_TICK_MS) {
        lastCommitMs = now;
        setNowMs(now);
      }
      animationFrameId = requestAnimationFrame(tick);
    };
    animationFrameId = requestAnimationFrame(tick);
    onCleanup(() => cancelAnimationFrame(animationFrameId));
  });

  /** 各半盤に置ける合体時計の natural 寸法 (min(halfW, halfH))。ClockLayout の isRotating 時と同じ
   *  計算で、floating palette ボタンの clearance は考慮しない (timer モードでは palette は popover 内)。 */
  const clockSize = createMemo(() => {
    const w = viewport.width();
    const h = viewport.height();
    const land = isLandscape();
    const halfW = land ? w / 2 : w;
    const halfH = land ? h : h / 2;
    return Math.min(halfW, halfH);
  });

  /** タイマー盤の実寸。AM 位置の合体時計 (clockSize) より一回り小さくする。 */
  const timerBoardSize = createMemo(() => clockSize() * TIMER_BOARD_SCALE);

  // たいむ遷移の WAAPI 群。入室 (enterBoing): merged 左顔 (AM 位置) を L で「リンリン」と魅せ、
  // MERGE_ANTICIPATION_MS 後に merged をクエイクさせつつ timer 盤 (PM 位置) を裏からスライドで生み出す。
  // 退室 (exitBoing): timer 盤を裏へ退ける。fill 付き WAAPI が timeline に溜まると弱 GPU でアニメが drop
  // するので、前回分を必ず cancel + onCleanup で解放する (残骸ゼロ)。
  let timerBoardRef: HTMLDivElement | undefined;
  let leftFaceRef: HTMLDivElement | undefined;
  let boardAnimation: Animation | null = null;
  let leftFaceAnimation: Animation | null = null; // 入りはリンリン、出りはクエイク (同じ merged 左顔に当てる)
  const cancelTransitionAnimations = () => {
    boardAnimation?.cancel();
    boardAnimation = null;
    leftFaceAnimation?.cancel();
    leftFaceAnimation = null;
  };
  createEffect(
    on(timerTransitionPhase, (phase, prev) => {
      if (prev === undefined || phase === prev) return;
      cancelTransitionAnimations();
      if (phase === "enterBoing") {
        // 呼び出し: merged が鈴で 1 回チリンと鳴らして timer 盤を呼び出す → (リンリン後) 盤が裏から生み出される。
        if (leftFaceRef) leftFaceAnimation = playMergeAnticipation(leftFaceRef);
        if (timerBoardRef) {
          boardAnimation = playEmergeFromBehindLeft(timerBoardRef, isLandscape(), MERGE_ANTICIPATION_MS);
        }
      } else if (phase === "exitBoing") {
        // どちらの行き先でも timer 盤は右下支点でバイバイッと振り、フェード+縮小で去る (回転にもとけいにも
        // 連れて行かれない盤のお別れ)。
        if (timerBoardRef) boardAnimation = playWaveGoodbye(timerBoardRef);
        // splitSide (→とけい) だけ、バイバイから少しズラして merged が「勝手に」自己分裂のクエイクをする。
        // centerSlide (→回転) は合体時計のまま中央へ行くので震わさない。
        if (timerTransitionKind() === "splitSide" && leftFaceRef) {
          leftFaceAnimation = playSplitAnticipation(leftFaceRef);
        }
      }
    }),
  );
  onCleanup(cancelTransitionAnimations);

  return (
    <>
      {/* 集中向けの静的背景 (中央に光だまり)。盤面の後ろに敷く decorative レイヤー。 */}
      <div class="timer-background absolute inset-0 pointer-events-none" />
      <div class={"absolute inset-0 flex items-stretch " + (isLandscape() ? "flex-row" : "flex-col")}>
        {/* AM 位置: 現在時刻の合体時計 (通常の黒針)。z-10 は ClockLayout の split と揃える。
            たいむ遷移の収束/発散フェーズ中は ClockLayout の clock ツリーが同じ位置に同じ merged 盤を描く
            (継ぎ目を消す受け渡し) ので、ここでは隠す (timerShowsLeftFace)。 */}
        <div
          class="timer-face-cell relative z-10 flex-1 flex flex-col items-center justify-center min-h-0 min-w-0"
          classList={{ "-mr-3": isLandscape(), "-mb-3": !isLandscape() }}
        >
          <Show when={timerShowsLeftFace()}>
            <div
              ref={leftFaceRef}
              class="timer-face relative"
              style={{ width: `${clockSize()}px`, height: `${clockSize()}px`, "transform-origin": "center" }}
            >
              <ClockFace period="merged" hours={refHours()} />
              <HandsLayer hours={refHours()} minutes={refMinuteFloat()} />
            </div>
          </Show>
        </div>

        {/* PM 位置: タイマー盤。グレーの現在針 (ghost) + 黒い終了マーカー針 + その間を塗るタイマー扇。
            扇は ClockFace の children = ベースと数字の間に入り、現在針から残り時間ぶん塗る。
            入室/退室で盤が L 盤の裏へスライドする (下の createEffect)。左へのはみ出しは寄せ量 (1.5rem 戻し)
            で L 盤の内側に収めて防ぐ (overflow クリップだと中央に切り口の線が出るため使わない)。 */}
        <div
          class="timer-face-cell relative flex-1 flex flex-col items-center justify-center min-h-0 min-w-0"
          classList={{ "-ml-3": isLandscape(), "-mt-3": !isLandscape() }}
        >
          <Show when={!timerBoardHidden()}>
            <div
              ref={timerBoardRef}
              class="timer-face timer-board-face relative"
              style={{ width: `${timerBoardSize()}px`, height: `${timerBoardSize()}px`, "transform-origin": "center" }}
            >
              <ClockFace period="merged" hours={boardHours()} bezel="gold">
                {/* 一時停止のドリフト背景 (うっすい青) を最背面に固定で敷く。開始基準から選択分ぶん。
                    赤い弧が実時刻で前へドリフトし、どいた後端に青が覗く = 停止中に過ぎた実時間。停止中のみ。 */}
                <Show when={pauseDrift()}>
                  {(drift) => <TimerWedge tone="blue" fromMinute={drift().from} spanMinutes={drift().span} />}
                </Show>
                {/* 到達済み扇 (開始点→現在針, 目盛なしの素グラデ) を先に敷き、残り扇 (現在針→終了マーカー,
                    1 分目盛つき) を上に。2 本は終了マーカーをグラデ濃端に共有して継ぎ目なく 1 枚に見せる。 */}
                <TimerWedge
                  fromMinute={boardMinuteFloat() - elapsedMinutes()}
                  spanMinutes={elapsedMinutes()}
                  gradientEndMinute={markerMinuteContinuous()}
                />
                <TimerWedge
                  fromMinute={boardMinuteFloat()}
                  spanMinutes={remainingMinutes()}
                  gradientEndMinute={markerMinuteContinuous()}
                  showTicks
                  deeper
                />
              </ClockFace>
              <HandsLayer
                hours={boardHours()}
                minutes={boardMinuteFloat()}
                minuteHandStyle={nowHandStyle(remainingSeconds() ?? 0, isSectorBoard())}
                markerMinutes={markerMinutes()}
                overrunMinutes={overrunMinutes()}
                overrunColor={overrunHandColor(isSectorBoard())}
              />
            </div>
          </Show>
        </div>
      </div>

      {/* デジタル残り時間。AM/PM バッジと同じスロット位置 (portrait 中央左 / landscape 中央上)。
          running / paused / done のとき出す。情報表示なのでタップは透過 (pointer-events-none)。 */}
      <Show when={digital() !== null}>
        <div
          class={
            "absolute z-20 px-4 py-1.5 tablet:px-7 tablet:py-3 rounded-full shadow-md " +
            "bg-gray-900/85 text-white font-black text-2xl tablet:text-4xl select-none pointer-events-none " +
            (isLandscape()
              ? "left-1/2 top-[var(--safe-edge-top)] -translate-x-1/2"
              : "left-[var(--safe-edge-left)] top-1/2 -translate-y-1/2")
          }
          style={{ "font-variant-numeric": "tabular-nums" }}
        >
          {digital()}
        </div>
      </Show>
    </>
  );
};

export default TimerLayout;
