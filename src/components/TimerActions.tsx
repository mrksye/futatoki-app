import { For, Show, createEffect, createSignal, onCleanup, onMount, type Component, type JSX } from "solid-js";
import { useI18n } from "../i18n";
import { useIsTablet } from "../hooks/useIsTablet";
import {
  timerPhase,
  pickerOrigin,
  selectedMinutes,
  runStartMs,
  openPicker,
  closePicker,
  selectMinutes,
  selectTargetTime,
  pauseTimer,
  resumeTimer,
  cancelTimer,
  completeTimer,
  TIMER_MINUTE_OPTIONS,
  type RingOrigin,
} from "../features/timer/state";
import { timerAlarm } from "../features/timer/timer-alarm";
import { timerChime } from "../features/timer/timer-chime";
import { showTimerStartToast } from "../features/timer/TimerStartToast";
import { closeActivePopover } from "../lib/exclusive-popover";
import { animateMotion, motionAllowed } from "../lib/motion";
import StopwatchIcon from "./icons/StopwatchIcon";
import PlayIcon from "./icons/PlayIcon";
import PauseIcon from "./icons/PauseIcon";
import CancelIcon from "./icons/CancelIcon";
import CheckIcon from "./icons/CheckIcon";
import MuteIcon from "./icons/MuteIcon";

/**
 * 分タイマーの操作 UI。timer モード中だけ ClockLayout から mount される floating レイヤーで、表示専用の
 * TimerLayout とは分離 (こちらは timer/state を書き換える側)。
 *
 * 右下に FAB を置き、上方向へ展開する:
 *  - unset:   「せっと」(ストップウォッチ) 1 個。押すとリングメニューを開く。
 *  - running: 「いちじていし」(⏸, 下=primary) +「とりけし」(✕, 上)。リングで分を選ぶと即この状態。
 *  - paused:  「さいかい」(▶, 下=primary) +「とりけし」(✕, 上)。
 *  - done:    「完了」(✓ primary, 下) +「しずかに」(🔇 上)。完了で unset リセット、しずかには音だけ止めて
 *             done 画面を残す。さらに done 中は画面どこをタップしても自動で音を止める (autoRotate の
 *             「画面どこタップで停止」と同じパターン、document level listener で実現)。
 *
 * リングメニューはできごと picker (ActivityPicker) の構築を参考にした TimerRingMenu (下記)。
 * mount/unmount は timer モードの出入りに同期するので、unmount 時に cancelTimer で状態を unset へ
 * リセットして再入室をクリーンに保つ。
 */

const FAB_CLASS =
  "w-12 h-12 tablet:w-14 tablet:h-14 rounded-full bg-white/80 shadow-md flex items-center " +
  "justify-center active:scale-90 transition-all text-gray-700 before:hidden";

/** せっと FAB の一辺 (FAB_CLASS の w-12 / tablet:w-14)。origin = FAB 中心なので、してい ボタンの右端を
 *  FAB の右端に合わせるのに半分ぶん右へ寄せる用。 */
const FAB_SIZE_MOBILE_PX = 48;
const FAB_SIZE_TABLET_PX = 56;

/** 完了時のバイブパターン (Vibration API 対応端末のみ。iOS は非対応で実質 Android 向け)。timer-watcher
 *  内 onDeadlineReached にも同じ定数があるが、ここはユーザジェスチャからの arm 呼び出しで「モード外
 *  発火経路」の callback に渡すために再掲する (両経路は冪等)。 */
const ALARM_VIBRATE_PATTERN = [200, 100, 200];

/** 締切到達時にモード外発火経路 (timer-alarm の setInterval watch) から呼ばれる音以外副作用。
 *  フォアグラウンドの TimerLayout の rAF と重複しても completeTimer は phase ガード、navigator.vibrate は
 *  仕様で上書き、chime disarm は冪等なので害なし。 */
const onDeadlineReached = (): void => {
  completeTimer();
  if (typeof navigator.vibrate === "function") navigator.vibrate(ALARM_VIBRATE_PATTERN);
  timerChime()?.disarm();
};

/** タイマー音声 (完了アラーム + 予告チャイム) はライフサイクルが同じ (running 開始 / さいかいで arm、
 *  いちじていし / とりけし / 完了で disarm) なので、独立した 2 エンジンへの arm/disarm をここで
 *  まとめてファンアウトする。endMs はジェスチャ内の呼び出し側が計算して渡す (両エンジンとも同じ締切)。
 *  mediaSessionTitle はアラームが OS の通知シェード / lock screen に出す表示文字列 (i18n 済)。
 *  arm 時にモード外発火 callback (onDeadlineReached) も渡して timer-watcher が起動時復元で arm する
 *  経路と挙動を揃える。 */
const armTimerAudio = (endMs: number, mediaSessionTitle: string): void => {
  timerAlarm()?.arm(endMs, mediaSessionTitle, onDeadlineReached);
  timerChime()?.arm(endMs);
};
const disarmTimerAudio = (): void => {
  timerAlarm()?.disarm();
  timerChime()?.disarm();
};

const TimerActions: Component = () => {
  const { t } = useI18n();

  // アラーム/チャイムの init/dispose と「モード切替で kill しない」責務は timer-watcher に集約済み
  // (App ルートで useTimerWatcher() が動く)。TimerActions の mount/unmount = timer モードの出入りに
  // 過剰反応しないことで、モード切替 → モード外発火経路 (timer-alarm の watch) → 起動時自動復元の
  // 一連が成立する。
  //
  // resume / arm は必ず下の onClick (ジェスチャ内) で行う (reactive effect で resume すると iOS が
  // ジェスチャ外と判定して unlock に失敗する)。チャイムは iOS では生成されない (initTimerChime が
  // iOS で即 return = keepalive のオーディオセッションを奪わないため)。

  /** 現在の running 設定 (開始時刻 + 選んだ分) から終了時刻を出して予約発火を張る/張り直す。 */
  const armCurrentRun = () => {
    const start = runStartMs();
    const minutes = selectedMinutes();
    if (start !== null && minutes !== null) armTimerAudio(start + minutes * 60000, t("timer.runningTitle"));
  };
  /** いちじていし: FSM を paused にして予約発火を取り消す (keepalive は維持)。 */
  const onPause = () => {
    pauseTimer();
    disarmTimerAudio();
  };
  /** さいかい: FSM を running に戻し、再計算した終了時刻で予約を張り直す。 */
  const onResume = () => {
    resumeTimer();
    armCurrentRun();
  };
  /** とりけし / 完了: FSM を unset に戻し、鳴っている/予約済みの音を止める。 */
  const onCancel = () => {
    cancelTimer();
    disarmTimerAudio();
  };
  // しずかにボタンの表示制御。音を止めたら役目が終わるので消す (再生する用途がない)。
  // done セッションごとに false から始まり、ボタンタップ or 画面どこタップで true になると Show が外れる。
  const [muted, setMuted] = createSignal(false);

  /** しずかに: 音だけ止めて done 画面 (経過時間表示) は残す。FSM は触らない。ボタン直接タップでも
   *  document listener 経由でも結果は同じ (disarm は冪等)。 */
  const onMute = () => {
    disarmTimerAudio();
    setMuted(true);
  };

  // done 中は画面のどこをタップしても音を止める。子供がボタン位置を探さなくても止められる UX。
  // disarm 冪等なので完了ボタン onClick との二重発火 (pointerdown → click) は無害。
  // listener は done に入ったタイミングで登録、phase が抜けたら Solid の effect 再実行で onCleanup が走る。
  // done に入った瞬間 muted を false にリセットして新セッションの消音ボタンを露出させる。
  createEffect(() => {
    if (timerPhase() !== "done") return;
    setMuted(false);
    const handler = () => {
      disarmTimerAudio();
      setMuted(true);
    };
    document.addEventListener("pointerdown", handler, { passive: true });
    onCleanup(() => document.removeEventListener("pointerdown", handler));
  });

  /** せっとを押したら他の popover (もーど / 設定) を閉じ、ボタン中心をリングの中心にして開く。 */
  const onSet = (e: MouseEvent) => {
    closeActivePopover();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    openPicker({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });
  };

  const iconClass = "w-6 h-6 tablet:w-7 tablet:h-7";

  return (
    <>
      <Show when={timerPhase() === "picking"}>
        <TimerRingMenu origin={pickerOrigin()} />
      </Show>

      {/* 右下 FAB。flex-col-reverse で先頭の子が一番下 (= primary) に来る。 */}
      <div class="fixed bottom-[var(--safe-edge-bottom)] right-[var(--safe-edge-right)] z-50 flex flex-col-reverse gap-3 items-center">
        <Show when={timerPhase() === "unset"}>
          <button class={FAB_CLASS} aria-label={t("timer.set")} onClick={onSet}>
            <StopwatchIcon class={iconClass} />
          </button>
        </Show>

        {/* running: いちじていし (⏸ primary, 最下段) + とりけし (上)。リングで分を選んだ瞬間にここへ来る。 */}
        <Show when={timerPhase() === "running"}>
          <button class={FAB_CLASS} aria-label={t("timer.pause")} onClick={onPause}>
            <PauseIcon class={iconClass} />
          </button>
          <button class={FAB_CLASS} aria-label={t("timer.cancel")} onClick={onCancel}>
            <CancelIcon class={iconClass} />
          </button>
        </Show>

        {/* paused: さいかい (▶ primary, 最下段) + とりけし (上)。 */}
        <Show when={timerPhase() === "paused"}>
          <button class={FAB_CLASS} aria-label={t("timer.resume")} onClick={onResume}>
            <PlayIcon class={iconClass} />
          </button>
          <button class={FAB_CLASS} aria-label={t("timer.cancel")} onClick={onCancel}>
            <CancelIcon class={iconClass} />
          </button>
        </Show>

        {/* done: 完了 (✓ primary, 下) + しずかに (🔇 上)。flex-col-reverse なので JSX 順 = 下→上。
            画面どこタップでも消音される (上の createEffect)、しずかにボタンは hint 兼キーボード操作経路。
            消音後はボタン自体を引っ込める (再生用途がないので役目終わり)。 */}
        <Show when={timerPhase() === "done"}>
          <button class={FAB_CLASS} aria-label={t("timer.done")} onClick={onCancel}>
            <CheckIcon class={iconClass} />
          </button>
          <Show when={!muted()}>
            <button class={FAB_CLASS} aria-label={t("timer.mute")} onClick={onMute}>
              <MuteIcon class={iconClass} />
            </button>
          </Show>
        </Show>
      </div>
    </>
  );
};

/* ── リングメニュー (分選択) ──────────────────────────────────────────────────
 * できごと picker の RingMenu / RingIcon を参考にした構築:
 *  - backdrop-blur + 暗幕の overlay、空タップで閉じる。
 *  - リングの中心 = せっとボタンの位置 (origin)。画面の角にあるので円周は端で見切れる。
 *  - ドラッグでリングを回せる (origin 中心の角度差をそのまま回転に渡す全域 angular 操作)、フリックで
 *    慣性、ホイールでも回る。見切れた数字は回して手元に持ってきてタップする。
 *  - 数字ボタンは origin から放射状に scale 0→1 + opacity で stagger bloom し、円周に着地する。
 *    子ボタンは親リングの回転を打ち消して数字を常に upright に保つ。
 *  - 数字タップ (または隙間タップで最寄りへ snap) で確定 → 即 running へ遷移しリングは unmount。
 *
 * timer setup 中は背景の時計が frozen (TimerLayout) なので、blur は 1 回 paint されたら以降は
 * compositing cache に乗り合成負荷ゼロ。できごと picker のような chronostasis 連動は不要。
 */

/** 初期表示の左回りローテート個数。先頭からこの数だけ末尾へ送る = 円の起点 (12 時) に来る値が後ろへ
 *  ずれる (= 見た目は左回りに N 個ずれる)。数を変えるだけで初期位置を調整できる。 */
const RING_LEFT_ROTATE = 6;

/** リング上に並べる数字 = 分の選択肢 15 個を円周に 1 周。せっとボタンが角にあって円は端で見切れるので、
 *  見えてる側に無い値はリングを回して手元へ持ってくる。15〜16 個で半径いっぱいなので 2 周は重なって不可
 *  (8 択時代は 2 周ぶん複製して reachability を稼いでいた)。
 *  RING_LEFT_ROTATE 個ぶん配列を左ローテートして初期の並びをずらす。回転 transform は bloom と干渉して
 *  バグるので、配列の並べ替えで実現する。 */
const RING_ITEMS: readonly number[] = [
  ...TIMER_MINUTE_OPTIONS.slice(RING_LEFT_ROTATE),
  ...TIMER_MINUTE_OPTIONS.slice(0, RING_LEFT_ROTATE),
];

// 15 個入るので円を大きめに (隣接ボタンが重ならない半径)。
const RING_RADIUS_MOBILE_PX = 168;
const RING_RADIUS_TABLET_PX = 236;
const BTN_SIZE_MOBILE_PX = 50;
const BTN_SIZE_TABLET_PX = 64;
const BTN_FONT_MOBILE_PX = 20;
const BTN_FONT_TABLET_PX = 26;
/** 時刻ラベル (H:MM) は分ラベルより長いので、正円ではなく横長 pill にして左右に小さめ padding を付ける
 *  (下の isPill)。フォントは分より一段だけ小さく。 */
const BTN_FONT_TIME_MOBILE_PX = 18;
const BTN_FONT_TIME_TABLET_PX = 24;
const STAGGER_MS = 30;
const APPEAR_DURATION_MS = 280;
/** bloom の stagger 起点 index = 8 時方向 (= 12 時起点で時計回り 2/3 周地点)。せっとボタンが右下角に
 *  居るので、8 時 (画面内へ向かう左下方向) から咲かせて 9→10→11→12 と見える側を CW でなぞる。リングの
 *  個数 (分=15 / 時刻=12) が変わっても同じ方向になるよう count から出す。 */
const staggerStartIndex = (count: number) => Math.round((count * 2) / 3);

/** 時刻指定リングで一番近い時刻 (t0) を出す slot = 9 時方向 (真左 = 180°)。12 時起点 CW で 180° に来る
 *  index は i/count = 3/4 の地点 (i = (i/count)*360-90 = 180 → i = 0.75*count)。リング個数が可変なので
 *  比から出す。初期位置の左ローテートと bloom の起点の両方に使う。 */
const nineOClockSlot = (count: number) => Math.round(count * 0.75);

/** 基準時刻 (ms) から時刻指定の選択肢を作る。秒を切り捨て、5 の倍数の分のうち「直近 (= 5 分以上 10 分未満
 *  先)」を起点に、5 分刻みで現在時刻から 60 分以内まで並べる。直近の 5 の倍数 (5 分未満先) は近すぎるので
 *  飛ばし、その次から始める。例: 15:11 → [15:20, 15:25, 15:30, … , 16:10]。これだけだとリングがガラ空きで
 *  押しにくいので、下の items() で 2 周ぶん複製して隙間を埋める。 */
const buildTimeTargets = (baseMs: number): number[] => {
  const d = new Date(baseMs);
  d.setSeconds(0, 0);
  // 次の 5 の倍数までの分 (0..4)。これは 5 分未満で近すぎるので +5 して 5..9 分後を起点にする。
  const firstOffset = ((5 - (d.getMinutes() % 5)) % 5) + 5;
  const baseMinMs = d.getTime();
  const targets: number[] = [];
  for (let off = firstOffset; off <= 60; off += 5) {
    targets.push(baseMinMs + off * 60000);
  }
  return targets;
};

/** リング上の 1 項目。表示ラベル / aria ラベル / タップ確定時の動作 (分なら selectMinutes、時刻なら
 *  selectTargetTime) を束ねて持ち、分モードと時刻モードを同じ描画・スナップ経路で扱えるようにする。 */
interface RingItem {
  label: string;
  ariaLabel: string;
  activate: () => void;
}

/** ドラッグ判定閾値 (できごと picker と同思想: 早い動きは低閾値、遅い drift は高閾値)。 */
const DRAG_THRESHOLD_FAST_PX = 2;
const DRAG_THRESHOLD_SLOW_PX = 6;
const DRAG_FAST_WINDOW_MS = 80;
/** ホイール感度 (deltaY 1 単位 → リング n° 回転)。 */
const WHEEL_DEG_PER_DELTA = 0.1;
/** 慣性: 直近 N ms の速度サンプルから初速度を出す。 */
const VELOCITY_WINDOW_MS = 80;
const INERTIA_DECAY_PER_MS = 0.003;
const INERTIA_VELOCITY_MIN = 0.015;

const TimerRingMenu: Component<{ origin: RingOrigin | null }> = (props) => {
  const { t, formatNumeral } = useI18n();
  const isTablet = useIsTablet();
  const ringRadius = () => (isTablet() ? RING_RADIUS_TABLET_PX : RING_RADIUS_MOBILE_PX);
  const btnSize = () => (isTablet() ? BTN_SIZE_TABLET_PX : BTN_SIZE_MOBILE_PX);
  /** ラベルのフォント。時刻モードは H:MM が長いので一回り小さく。 */
  const btnFont = () =>
    ringMode() === "time"
      ? isTablet()
        ? BTN_FONT_TIME_TABLET_PX
        : BTN_FONT_TIME_MOBILE_PX
      : isTablet()
        ? BTN_FONT_TABLET_PX
        : BTN_FONT_MOBILE_PX;

  /** origin が null (保険) なら画面中央。 */
  const origin = (): RingOrigin =>
    props.origin ?? { x: window.innerWidth / 2, y: window.innerHeight / 2 };

  // リングの種類: 分選択 (初期) か時刻指定か。中央の「してい」ボタンで time へ切り替える。time に入った
  // 瞬間の現在時刻を baseTimeMs に固定して選択肢を作る (毎分ズレないよう snapshot)。
  const [ringMode, setRingMode] = createSignal<"minutes" | "time">("minutes");
  const [baseTimeMs, setBaseTimeMs] = createSignal(0);

  /** 分タップ確定 → 即 running。アラーム arm とトーストもこのジェスチャ内で行う (AudioContext unlock)。 */
  const startWithMinutes = (m: number) => {
    selectMinutes(m);
    const start = runStartMs();
    if (start !== null) armTimerAudio(start + m * 60000, t("timer.runningTitle"));
    showTimerStartToast(t("timer.startToast"));
  };
  /** 時刻タップ確定 → 即 running。endMs は目標時刻そのものなので arm にもそれを渡す。 */
  const startWithTargetTime = (targetMs: number) => {
    selectTargetTime(targetMs);
    armTimerAudio(targetMs, t("timer.runningTitle"));
    showTimerStartToast(t("timer.startToast"));
  };

  /** ロケール数字で時刻を H:MM 表記 (分のみ 2 桁ゼロ埋め)。例: 15:20。 */
  const formatClock = (ms: number): string => {
    const d = new Date(ms);
    const m = d.getMinutes();
    const mm = m < 10 ? formatNumeral(0) + formatNumeral(m) : formatNumeral(m);
    return `${formatNumeral(d.getHours())}:${mm}`;
  };

  /** 描画順 (slot 0 から CW) に並べたリング項目。
   *  - minutes: RING_ITEMS (= 左ローテート済みの分選択肢) をそのまま。
   *  - time: 6 個の時刻を 2 周ぶん複製して 12 個にし、先頭 (一番近い時刻) が 8 時方向 (stagger 起点) に
   *    来るよう左ローテートする。これで「8 時方向から右回りに 10 分後・20 分後…」の並びになる。 */
  const items = (): RingItem[] => {
    if (ringMode() === "time") {
      const targets = buildTimeTargets(baseTimeMs());
      const doubled = [...targets, ...targets];
      const n = doubled.length;
      const rot = (n - nineOClockSlot(n)) % n; // 先頭 (一番近い時刻) を 9 時方向 slot へ
      const ordered = [...doubled.slice(rot), ...doubled.slice(0, rot)];
      return ordered.map((ms) => ({
        label: formatClock(ms),
        ariaLabel: t("timer.timeOption", { time: formatClock(ms) }),
        activate: () => startWithTargetTime(ms),
      }));
    }
    return RING_ITEMS.map((m) => ({
      label: formatNumeral(m),
      ariaLabel: t("timer.minuteOption", { n: formatNumeral(m) }),
      activate: () => startWithMinutes(m),
    }));
  };

  const [ringRotation, setRingRotation] = createSignal(0); // deg
  const rotateRing = (deltaDeg: number) => setRingRotation((r) => r + deltaDeg);

  let dragStart: { x: number; y: number; timeStamp: number } | null = null;
  let dragHappened = false;
  let lastAngularRad = 0;
  let velocityHistory: { time: number; deltaDeg: number }[] = [];
  let inertiaRaf: number | null = null;
  /** 慣性中のタップは慣性キャンセルだけで close しない (止めたいだけ)。 */
  let inertiaCanceledByTap = false;
  /** pointerdown 座標を click まで持ち越し、隙間タップ救済で最寄り数字に snap する用。 */
  let pointerDownCoords: { x: number; y: number } | null = null;

  // rAF 間引き: 120Hz 端末で 1 frame に複数 pointermove が来ても回転 commit は次 rAF で 1 回。
  let pendingDelta = 0;
  let rotateRaf: number | null = null;
  const flushRotation = () => {
    rotateRaf = null;
    if (pendingDelta !== 0) {
      rotateRing(pendingDelta);
      pendingDelta = 0;
    }
  };
  const scheduleRotation = (delta: number) => {
    pendingDelta += delta;
    if (rotateRaf === null) rotateRaf = requestAnimationFrame(flushRotation);
  };
  const flushPendingNow = () => {
    if (rotateRaf !== null) {
      cancelAnimationFrame(rotateRaf);
      rotateRaf = null;
    }
    if (pendingDelta !== 0) {
      rotateRing(pendingDelta);
      pendingDelta = 0;
    }
  };
  const cancelPendingRotation = () => {
    if (rotateRaf !== null) {
      cancelAnimationFrame(rotateRaf);
      rotateRaf = null;
    }
    pendingDelta = 0;
  };

  const cancelInertia = () => {
    if (inertiaRaf !== null) {
      cancelAnimationFrame(inertiaRaf);
      inertiaRaf = null;
    }
  };
  const startInertia = (initialVelocityDegPerMs: number) => {
    cancelInertia();
    let velocity = initialVelocityDegPerMs;
    let lastTime = performance.now();
    const tick = (now: number) => {
      const dt = now - lastTime;
      lastTime = now;
      if (Math.abs(velocity) < INERTIA_VELOCITY_MIN) {
        inertiaRaf = null;
        return;
      }
      rotateRing(velocity * dt);
      velocity *= Math.exp(-INERTIA_DECAY_PER_MS * dt);
      inertiaRaf = requestAnimationFrame(tick);
    };
    inertiaRaf = requestAnimationFrame(tick);
  };

  const onPointerDown = (e: PointerEvent) => {
    if (inertiaRaf !== null) {
      cancelInertia();
      inertiaCanceledByTap = true;
    }
    dragStart = { x: e.clientX, y: e.clientY, timeStamp: e.timeStamp };
    pointerDownCoords = { x: e.clientX, y: e.clientY };
    dragHappened = false;
    velocityHistory = [];
    const o = origin();
    lastAngularRad = Math.atan2(e.clientY - o.y, e.clientX - o.x);
  };

  const onPointerMove = (e: PointerEvent) => {
    if (!dragStart) return;
    if (!dragHappened) {
      const dist = Math.hypot(e.clientX - dragStart.x, e.clientY - dragStart.y);
      const elapsed = e.timeStamp - dragStart.timeStamp;
      const isFastIntent = elapsed < DRAG_FAST_WINDOW_MS && dist >= DRAG_THRESHOLD_FAST_PX;
      const isLongDrag = dist >= DRAG_THRESHOLD_SLOW_PX;
      if (!isFastIntent && !isLongDrag) return;
      dragHappened = true;
    }
    // 画面座標は y 下向き正なので atan2 は CW で増加 → CW ドラッグ (+) と一致。
    const o = origin();
    const currentRad = Math.atan2(e.clientY - o.y, e.clientX - o.x);
    let deltaRad = currentRad - lastAngularRad;
    if (deltaRad > Math.PI) deltaRad -= 2 * Math.PI;
    else if (deltaRad < -Math.PI) deltaRad += 2 * Math.PI;
    const deltaDeg = (deltaRad * 180) / Math.PI;
    lastAngularRad = currentRad;
    scheduleRotation(deltaDeg);

    const now = performance.now();
    velocityHistory.push({ time: now, deltaDeg });
    const cutoff = now - VELOCITY_WINDOW_MS;
    while (velocityHistory.length > 0 && velocityHistory[0]!.time < cutoff) {
      velocityHistory.shift();
    }
  };

  const onPointerUp = () => {
    dragStart = null;
    flushPendingNow();
    if (motionAllowed() && velocityHistory.length > 0) {
      const totalDeg = velocityHistory.reduce((s, h) => s + h.deltaDeg, 0);
      const oldest = velocityHistory[0]!.time;
      const span = performance.now() - oldest || 1;
      const velocity = totalDeg / span;
      if (Math.abs(velocity) >= INERTIA_VELOCITY_MIN) startInertia(velocity);
    }
    velocityHistory = [];
  };

  const onClick = () => {
    if (inertiaCanceledByTap) {
      inertiaCanceledByTap = false;
      return;
    }
    if (dragHappened) {
      dragHappened = false;
      return;
    }
    // 隙間タップ救済: 「リング帯」(中心からの距離が ringRadius ± btnSize) 内なら最寄り項目へ snap。
    // 項目本体タップは TimerRingButton 側 (stopPropagation) で完結するので、ここに来るのは隙間だけ。
    // activate() の中でアラーム arm とトーストまで行う (この onClick がジェスチャ起点 = AudioContext unlock)。
    if (pointerDownCoords) {
      const o = origin();
      const dx = pointerDownCoords.x - o.x;
      const dy = pointerDownCoords.y - o.y;
      const dist = Math.hypot(dx, dy);
      if (dist >= ringRadius() - btnSize() && dist <= ringRadius() + btnSize()) {
        const list = items();
        const N = list.length;
        const ringRotRad = (ringRotation() * Math.PI) / 180;
        // ボタンは angleRad = (i/N)*2π - π/2 で配置 + 親リングの rotation。逆算で最寄り index。
        const rawIdx = ((Math.atan2(dy, dx) - ringRotRad + Math.PI / 2) / (2 * Math.PI)) * N;
        const nearest = ((Math.round(rawIdx) % N) + N) % N;
        list[nearest]!.activate();
        return;
      }
    }
    closePicker();
  };

  const onWheel = (e: WheelEvent) => {
    e.preventDefault();
    cancelInertia();
    const sign = e.deltaY > 0 ? 1 : -1;
    rotateRing(sign * Math.abs(e.deltaY) * WHEEL_DEG_PER_DELTA);
  };

  onCleanup(() => {
    cancelInertia();
    cancelPendingRotation();
  });

  return (
    <div
      class="fixed inset-0 z-[100] backdrop-blur-[2px]"
      style={{ background: "rgba(0,0,0,0.4)", "touch-action": "none" }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onClick={onClick}
      onWheel={onWheel}
    >
      {/* リング container: origin 中心の 0×0 要素。数字ボタンを直タップで拾えるよう pointer-events は
          素通しのまま (none にすると子の button まで無効化され、全タップが overlay onClick 任せになる)。
          ドラッグ用の pointer event はボタンから overlay へ bubble するので両立する。JS が触る inline は
          --ring-rot 1 個だけ (transform 文字列は静的)。 */}
      <div
        class="fixed"
        style={{
          left: `${origin().x}px`,
          top: `${origin().y}px`,
          width: 0,
          height: 0,
          transform: "rotate(var(--ring-rot, 0deg))",
          "--ring-rot": `${ringRotation()}deg`,
          "will-change": "transform",
        }}
      >
        <For each={items()}>
          {(item, i) => (
            <TimerRingButton
              label={item.label}
              ariaLabel={item.ariaLabel}
              onActivate={item.activate}
              index={i()}
              count={items().length}
              staggerStart={ringMode() === "time" ? nineOClockSlot(items().length) : staggerStartIndex(items().length)}
              ringRadius={ringRadius()}
              size={btnSize()}
              font={btnFont()}
              isPill={ringMode() === "time"}
            />
          )}
        </For>
      </div>

      {/* リング中央 (= せっとボタン位置) のモード切替ボタン。分モードなら「してい」テキスト (→時刻)、
          時刻モードならタイマーアイコン (→分) を出して相互に行き来できる。右下角に居るので右端を origin に
          合わせて左へ伸ばし (translate(-100%, -50%))、ボタン全体を画面内に収める。回転 container の外で
          常に upright・固定。 */}
      <ModeToggleButton
        origin={{
          // 右端を FAB の右端に合わせる: origin (= FAB 中心) から FAB 半分ぶん右へ寄せた点を右端基準にする。
          x: origin().x + (isTablet() ? FAB_SIZE_TABLET_PX : FAB_SIZE_MOBILE_PX) / 2,
          y: origin().y,
        }}
        ariaLabel={ringMode() === "minutes" ? t("timer.specify") : t("timer.set")}
        onActivate={() => {
          // どちらへ切り替えても、新しいリングが初期姿勢 (t0 が 8 時方向) で出るよう回転をリセット。
          cancelInertia();
          cancelPendingRotation();
          setRingRotation(0);
          if (ringMode() === "minutes") {
            setBaseTimeMs(Date.now());
            setRingMode("time");
          } else {
            setRingMode("minutes");
          }
        }}
      >
        {ringMode() === "minutes" ? (
          t("timer.specify")
        ) : (
          <StopwatchIcon class="w-6 h-6 tablet:w-7 tablet:h-7" />
        )}
      </ModeToggleButton>
    </div>
  );
};

/** リング上の項目 (分 or 時刻)。見た目専用 (pointer-events none, 親 container から継承)。タップ/ドラッグは
 *  すべて overlay 側で受け、選択は overlay の「最寄りスナップ」で確定する。これにより「項目を掴んで
 *  ドラッグ = 回転、タップ = 最寄り項目確定」が両立する (ボタンが pointer を奪わない)。確定動作は親が
 *  渡す onActivate に閉じ込めてあるので、ここは分/時刻のどちらかを知らない。 */
const TimerRingButton: Component<{
  label: string;
  ariaLabel: string;
  onActivate: () => void;
  index: number;
  count: number;
  staggerStart: number;
  ringRadius: number;
  size: number;
  font: number;
  /** true なら横長 pill (幅 auto + 左右 padding)、false なら正円 (幅 = size)。時刻ラベルは長いので pill。 */
  isPill: boolean;
}> = (props) => {
  let ref: HTMLButtonElement | undefined;

  // 円周上の中心座標 (12 時 = -90° から CW)。pill は幅が可変なので、top-left オフセットではなく
  // translate(-50%, -50%) で「自分の中心」を円周点に合わせる (幅を知らずに中央寄せできる)。
  const angleRad = (props.index / props.count) * 2 * Math.PI - Math.PI / 2;
  const cx = props.ringRadius * Math.cos(angleRad);
  const cy = props.ringRadius * Math.sin(angleRad);
  // 親リングの rotate を打ち消してラベルを upright に保つ (--ring-rot 変化は CSS cascade で自動反映)。
  const restingTransform =
    `translate(${cx}px, ${cy}px) translate(-50%, -50%) rotate(calc(-1 * var(--ring-rot, 0deg)))`;

  // bloom: origin (= container 中心 = せっとボタン) から円周へ scale 0→1。stagger は 8 時 (= 画面内へ
  // 向かう側) を起点に CW で続く → 最初に咲く数個が確実に見える位置に来る。
  onMount(() => {
    if (!ref) return;
    const staggerOffset = (props.index - props.staggerStart + props.count) % props.count;
    const start = `translate(0px, 0px) translate(-50%, -50%) scale(0)`;
    const end = `translate(${cx}px, ${cy}px) translate(-50%, -50%) scale(1)`;
    animateMotion(
      ref,
      [
        { transform: start, opacity: 0 },
        { transform: end, opacity: 1 },
      ],
      {
        duration: APPEAR_DURATION_MS,
        delay: staggerOffset * STAGGER_MS,
        easing: "cubic-bezier(.34,1.56,.64,1)",
        fill: "backwards",
      },
    );
  });

  // ラベル本体の直タップで確定。stopPropagation で overlay の onClick (隙間救済 / 慣性停止ゲート) を
  // 飛び越えるので、慣性で空回り中でも一発で選択できる (overlay 任せだと第一タップが回転停止に食われる)。
  // この click ハンドラ自体がジェスチャの起点なので、onActivate 内のアラーム arm が両 AudioContext を
  // ユーザジェスチャ内で resume できる (overlay 隙間救済路と同じ arm 手順)。
  const onClick = (e: MouseEvent) => {
    e.stopPropagation();
    props.onActivate();
  };

  return (
    <button
      ref={ref}
      class={
        "absolute top-0 left-0 rounded-full bg-white shadow-lg text-gray-800 font-black flex items-center justify-center whitespace-nowrap before:hidden" +
        (props.isPill ? " px-2.5 tablet:px-3" : "")
      }
      style={{
        // pill は幅 auto (内容 + 左右 padding)、正円は size の正方形。高さはどちらも size。
        ...(props.isPill ? {} : { width: `${props.size}px` }),
        height: `${props.size}px`,
        "font-size": `${props.font}px`,
        transform: restingTransform,
        // 各ボタンを GPU layer に固定 → 親 rotate と自分の counter-rotate が composite-only で完結。
        "will-change": "transform",
      }}
      onClick={onClick}
      aria-label={props.ariaLabel}
    >
      {props.label}
    </button>
  );
};

/** リング中央 (せっとボタン位置) に出るモード切替ボタン。分モードでは「してい」テキスト、時刻モードでは
 *  タイマーアイコンを children で受けて描画する。りせっとボタン (ActivityPicker) と同じ作り: fixed、
 *  scale 0→1 で出現、overlay の drag/click に巻き込まれないよう pointerdown / click を止める。ただし
 *  origin が画面右下角なので、中心ではなく右端を origin に合わせて左へ伸ばし (translate(-100%, -50%))、
 *  ボタン全体を画面内に収める。中身は children で直接描画 (グローバルの button[aria-label]::before は
 *  before:hidden で抑止)。 */
const ModeToggleButton: Component<{
  origin: RingOrigin;
  ariaLabel: string;
  onActivate: () => void;
  children: JSX.Element;
}> = (props) => {
  let buttonRef: HTMLButtonElement | undefined;

  onMount(() => {
    if (!buttonRef) return;
    animateMotion(
      buttonRef,
      [
        { transform: "translate(-100%, -50%) scale(0)", opacity: 0 },
        { transform: "translate(-100%, -50%) scale(1)", opacity: 1 },
      ],
      { duration: APPEAR_DURATION_MS, easing: "cubic-bezier(.34,1.56,.64,1)", fill: "backwards" },
    );
  });

  const onPointerDown = (e: PointerEvent) => e.stopPropagation();
  const onClick = (e: MouseEvent) => {
    e.stopPropagation();
    props.onActivate();
  };

  return (
    <button
      ref={buttonRef}
      class="fixed px-3 py-1.5 tablet:px-6 tablet:py-3 rounded-full text-base tablet:text-xl font-bold whitespace-nowrap bg-white text-gray-800 shadow-lg before:hidden"
      style={{
        left: `${props.origin.x}px`,
        top: `${props.origin.y}px`,
        // 右端を origin に合わせて左へ伸ばす (角でも全体が画面内)。
        transform: "translate(-100%, -50%)",
        cursor: "pointer",
        "will-change": "transform",
      }}
      onPointerDown={onPointerDown}
      onClick={onClick}
      aria-label={props.ariaLabel}
    >
      {props.children}
    </button>
  );
};

export default TimerActions;
