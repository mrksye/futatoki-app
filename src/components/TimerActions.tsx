import { For, Show, createSignal, onCleanup, onMount, type Component } from "solid-js";
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
  pauseTimer,
  resumeTimer,
  cancelTimer,
  TIMER_MINUTE_OPTIONS,
  type RingOrigin,
} from "../features/timer/state";
import { timerAlarm, initTimerAlarm } from "../features/timer/timer-alarm";
import { timerChime, initTimerChime } from "../features/timer/timer-chime";
import { closeActivePopover } from "../lib/exclusive-popover";
import { animateMotion, motionAllowed } from "../lib/motion";
import StopwatchIcon from "./icons/StopwatchIcon";
import PlayIcon from "./icons/PlayIcon";
import PauseIcon from "./icons/PauseIcon";
import CancelIcon from "./icons/CancelIcon";
import CheckIcon from "./icons/CheckIcon";

/**
 * 分タイマーの操作 UI。timer モード中だけ ClockLayout から mount される floating レイヤーで、表示専用の
 * TimerLayout とは分離 (こちらは timer/state を書き換える側)。
 *
 * 右下に FAB を置き、上方向へ展開する:
 *  - unset:   「せっと」(ストップウォッチ) 1 個。押すとリングメニューを開く。
 *  - running: 「いちじていし」(⏸, 下=primary) +「とりけし」(✕, 上)。リングで分を選ぶと即この状態。
 *  - paused:  「さいかい」(▶, 下=primary) +「とりけし」(✕, 上)。
 *  - done:    「完了」(✓) 1 個。押すと音を止めて unset に戻る。
 *
 * リングメニューはできごと picker (ActivityPicker) の構築を参考にした TimerRingMenu (下記)。
 * mount/unmount は timer モードの出入りに同期するので、unmount 時に cancelTimer で状態を unset へ
 * リセットして再入室をクリーンに保つ。
 */

const FAB_CLASS =
  "w-12 h-12 tablet:w-14 tablet:h-14 rounded-full bg-white/80 shadow-md flex items-center " +
  "justify-center active:scale-90 transition-all text-gray-700 before:hidden";

/** タイマー音声 (完了アラーム + 予告チャイム) はライフサイクルが同じ (running 開始 / さいかいで arm、
 *  いちじていし / とりけし / 完了 / 退室で disarm) なので、独立した 2 エンジンへの arm/disarm をここで
 *  まとめてファンアウトする。endMs はジェスチャ内の呼び出し側が計算して渡す (両エンジンとも同じ締切)。 */
const armTimerAudio = (endMs: number): void => {
  timerAlarm()?.arm(endMs);
  timerChime()?.arm(endMs);
};
const disarmTimerAudio = (): void => {
  timerAlarm()?.disarm();
  timerChime()?.disarm();
};

const TimerActions: Component = () => {
  const { t } = useI18n();

  // アラーム (AudioContext + 82秒音源の decode) と予告チャイム (オシレータ合成) は初回入室で 1 度だけ生成し、
  // 以降は使い回す (どちらの init も生成済みなら no-op)。入退室のたびに作り直すと生成/破棄コストと decode の
  // GC 圧が毎回かかり繰り返すほど重くなるため。resume / arm は必ず下の onClick (ジェスチャ内) で行う
  // (reactive effect で resume すると iOS がジェスチャ外と判定して unlock に失敗する)。チャイムは iOS では
  // 生成されない (initTimerChime が iOS で即 return = keepalive のオーディオセッションを奪わないため)。
  onMount(() => {
    initTimerAlarm();
    initTimerChime();
  });
  // timer モードを抜ける (= この component が unmount される) とき選択状態を破棄して unset へ戻し、予約発火を
  // 取り消す (音源本体は使い回すので dispose せず disarm のみ。keepalive / AudioContext は維持)。
  onCleanup(() => {
    cancelTimer();
    disarmTimerAudio();
  });

  /** 現在の running 設定 (開始時刻 + 選んだ分) から終了時刻を出して予約発火を張る/張り直す。 */
  const armCurrentRun = () => {
    const start = runStartMs();
    const minutes = selectedMinutes();
    if (start !== null && minutes !== null) armTimerAudio(start + minutes * 60000);
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

        {/* done: 完了 (✓) 1 個。音を止めて unset に戻す。 */}
        <Show when={timerPhase() === "done"}>
          <button class={FAB_CLASS} aria-label={t("timer.done")} onClick={onCancel}>
            <CheckIcon class={iconClass} />
          </button>
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
const STAGGER_MS = 30;
const APPEAR_DURATION_MS = 280;
/** bloom の stagger 起点 index = 8 時方向 (= 12 時起点で時計回り 2/3 周地点)。せっとボタンが右下角に
 *  居るので、8 時 (画面内へ向かう左下方向) から咲かせて 9→10→11→12 と見える側を CW でなぞる。 */
const STAGGER_START_INDEX = Math.round((RING_ITEMS.length * 2) / 3);

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
  const isTablet = useIsTablet();
  const ringRadius = () => (isTablet() ? RING_RADIUS_TABLET_PX : RING_RADIUS_MOBILE_PX);
  const btnSize = () => (isTablet() ? BTN_SIZE_TABLET_PX : BTN_SIZE_MOBILE_PX);
  const btnFont = () => (isTablet() ? BTN_FONT_TABLET_PX : BTN_FONT_MOBILE_PX);

  /** origin が null (保険) なら画面中央。 */
  const origin = (): RingOrigin =>
    props.origin ?? { x: window.innerWidth / 2, y: window.innerHeight / 2 };

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
    // 隙間タップ救済: 「リング帯」(中心からの距離が ringRadius ± btnSize) 内なら最寄り数字へ snap。
    // 数字本体タップは TimerRingButton 側 (stopPropagation) で完結するので、ここに来るのは隙間だけ。
    if (pointerDownCoords) {
      const o = origin();
      const dx = pointerDownCoords.x - o.x;
      const dy = pointerDownCoords.y - o.y;
      const dist = Math.hypot(dx, dy);
      if (dist >= ringRadius() - btnSize() && dist <= ringRadius() + btnSize()) {
        const N = RING_ITEMS.length;
        const ringRotRad = (ringRotation() * Math.PI) / 180;
        // ボタンは angleRad = (i/N)*2π - π/2 で配置 + 親リングの rotation。逆算で最寄り index。
        const rawIdx = ((Math.atan2(dy, dx) - ringRotRad + Math.PI / 2) / (2 * Math.PI)) * N;
        const nearest = ((Math.round(rawIdx) % N) + N) % N;
        const minutes = RING_ITEMS[nearest]!;
        selectMinutes(minutes);
        // この onClick がジェスチャの起点。ここでアラームとチャイムを arm し、両 AudioContext を unlock
        // (resume) しつつ終了時刻基準の予約発火を張る (旧 Howler が肩代わりしていたグローバル unlock が
        // 無くなったため)。
        const start = runStartMs();
        if (start !== null) armTimerAudio(start + minutes * 60000);
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
        <For each={RING_ITEMS}>
          {(minutes, i) => (
            <TimerRingButton
              minutes={minutes}
              index={i()}
              count={RING_ITEMS.length}
              ringRadius={ringRadius()}
              size={btnSize()}
              font={btnFont()}
            />
          )}
        </For>
      </div>
    </div>
  );
};

/** リング上の数字。見た目専用 (pointer-events none, 親 container から継承)。タップ/ドラッグは
 *  すべて overlay 側で受け、選択は overlay の「最寄りスナップ」で確定する。これにより「数字を掴んで
 *  ドラッグ = 回転、タップ = 最寄り数字確定」が両立する (ボタンが pointer を奪わない)。 */
const TimerRingButton: Component<{
  minutes: number;
  index: number;
  count: number;
  ringRadius: number;
  size: number;
  font: number;
}> = (props) => {
  const { t, formatNumeral } = useI18n();
  let ref: HTMLButtonElement | undefined;

  // 円周位置 (12 時 = -90° から CW)。container 中心基準の top-left オフセット。
  const angleRad = (props.index / props.count) * 2 * Math.PI - Math.PI / 2;
  const offsetX = props.ringRadius * Math.cos(angleRad) - props.size / 2;
  const offsetY = props.ringRadius * Math.sin(angleRad) - props.size / 2;
  // 親リングの rotate を打ち消して数字を upright に保つ (--ring-rot 変化は CSS cascade で自動反映)。
  const restingTransform =
    `translate(${offsetX}px, ${offsetY}px) rotate(calc(-1 * var(--ring-rot, 0deg)))`;

  // bloom: origin (= container 中心 = せっとボタン) から円周へ scale 0→1。stagger は 9 時 (= 画面内へ
  // 向かう側) を起点に CW で続く → 最初に咲く数個が確実に見える位置に来る。
  onMount(() => {
    if (!ref) return;
    const staggerOffset = (props.index - STAGGER_START_INDEX + props.count) % props.count;
    const start = `translate(${-props.size / 2}px, ${-props.size / 2}px) scale(0)`;
    const end = `translate(${offsetX}px, ${offsetY}px) scale(1)`;
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

  // 数字本体の直タップで確定。stopPropagation で overlay の onClick (隙間救済 / 慣性停止ゲート) を
  // 飛び越えるので、慣性で空回り中でも一発で選択できる (overlay 任せだと第一タップが回転停止に食われる)。
  // この click ハンドラ自体がジェスチャの起点なので、ここでアラームとチャイムを arm する = 両 AudioContext を
  // ユーザジェスチャ内で resume できる (overlay 隙間救済路と同じ arm 手順)。
  const onClick = (e: MouseEvent) => {
    e.stopPropagation();
    selectMinutes(props.minutes);
    const start = runStartMs();
    if (start !== null) armTimerAudio(start + props.minutes * 60000);
  };

  return (
    <button
      ref={ref}
      class="absolute top-0 left-0 rounded-full bg-white shadow-lg text-gray-800 font-black flex items-center justify-center before:hidden"
      style={{
        width: `${props.size}px`,
        height: `${props.size}px`,
        "font-size": `${props.font}px`,
        transform: restingTransform,
        // 各数字を GPU layer に固定 → 親 rotate と自分の counter-rotate が composite-only で完結。
        "will-change": "transform",
      }}
      onClick={onClick}
      aria-label={t("timer.minuteOption", { n: formatNumeral(props.minutes) })}
    >
      {formatNumeral(props.minutes)}
    </button>
  );
};

export default TimerActions;
