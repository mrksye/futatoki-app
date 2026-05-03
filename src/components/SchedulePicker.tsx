import { For, Show, createSignal, onCleanup, onMount } from "solid-js";
import type { Component } from "solid-js";
import { SCHEDULE_ICONS, type ScheduleIconDef } from "../features/schedule/icons";
import {
  pickerOpen,
  pickerOrigin,
  pickerRotation,
  closePicker,
  rotatePicker,
  type PickerOrigin,
} from "../features/schedule/picker";
import { setScheduleAt, schedule } from "../features/schedule/state";
import { enterResetWarning } from "../features/schedule/interaction";
import { rotateMinutes } from "../features/free-rotation/state";
import { useIsTablet } from "../hooks/useIsTablet";
import { useOrientation } from "../hooks/useOrientation";
import { useI18n, type TKey } from "../i18n";
import { animateMotion, motionAllowed } from "../lib/motion";

/**
 * 予定アイコン選択用リングメニュー。Overlay + 11 個のアイコンが半径 RING_RADIUS で円周配置。
 * 開閉アニメは origin → 各アイコン位置に放射状にニュッと出る (stagger 30ms, CW 順)。
 * ドラッグは origin 中心の角度差をそのまま回転に渡す全域 angular 操作、ホイールは別枠で deltaY を回転に。
 * アイコンタップで rotateMinutes() に予定追加 + 閉じる、Overlay 空タップで閉じる。
 * リング中央には予定が 1 件以上ある時だけ「りせっと」ボタンが出て、押すと全予定が削除警告に入る。
 */

/** SettingsPanel の四隅ボタンと同じ tablet ブレイクポイントで大きくする。 */
const RING_RADIUS_MOBILE = 110;
const RING_RADIUS_TABLET = 160;
const ICON_SIZE_MOBILE = 44;
const ICON_SIZE_TABLET = 64;
const ICON_FONT_MOBILE = 26;
const ICON_FONT_TABLET = 38;
const STAGGER_MS = 30;
const APPEAR_DURATION_MS = 280;

/** りせっとボタンを mount するまでの遅延。リング icon が全部出てから表示するのが目的。
 *  よていボタン押下→picker open の click 合成イベントが overlay/中央に届くタイミングと race して
 *  りせっとを誤発火するのを防ぐ意味も兼ねる (DOM に居なければ click は絶対に当たらない)。 */
const RESET_BUTTON_MOUNT_DELAY_MS = (SCHEDULE_ICONS.length - 1) * STAGGER_MS + APPEAR_DURATION_MS;

/** 「ドラッグ」と「タップ」を区別する閾値。タップの drift と意図的なドラッグを両取りするため
 *  時間軸を入れる: pointerdown 直後 (FAST_WINDOW_MS 以内) に動いたら swipe intent と判定して
 *  低い閾値で確定、それより遅れて動いた場合は drift の可能性を考慮して高い閾値を要求する。
 *  このアプリは「長押ししてからドラッグ」する操作が無く、ドラッグはすぐ指を動かすので
 *  fast path のリスクは低い。 */
const DRAG_THRESHOLD_FAST_PX = 2;
const DRAG_THRESHOLD_SLOW_PX = 6;
const DRAG_FAST_WINDOW_MS = 80;
/** マウスホイール感度 (deltaY 1 単位 → リング n° 回転)。 */
const WHEEL_DEG_PER_DELTA = 0.1;
/** 1 wheel event ぶんの回転を瞬時に当てると単発ノッチで 10° ジャンプして「カクカク」と感じる。
 *  累積目標値に向かって ease-out で滑らかに寄せる時間。fast 連射時は前 tween を取り消して新しい
 *  目標へ重ねるので、速い操作でもラグなく追従する。 */
const WHEEL_TWEEN_DURATION_MS = 200;
/** ホイールが止まった (= 最後の event から WHEEL_IDLE_TRIGGER_MS 経過) と判定する idle 時間。
 *  経過後に慣性発火を試みる。早すぎると連続スクロール途中で発火、遅すぎるとフリック後の余韻
 *  が遅れる。100ms はノッチ間隔の典型 (200ms+) より短く、フリック連射 (~30ms) より長い。 */
const WHEEL_IDLE_TRIGGER_MS = 100;
/** ホイール慣性発火に必要な「直近窓内の累積回転量」(deg)。1 ノッチ (10°) では発火させず、
 *  2-3 ノッチ相当のフリック級だけ発火させる。 */
const WHEEL_INERTIA_MIN_TOTAL_DEG = 25;

/** 慣性: 直近 N ms の速度サンプルから初速度を出す (drag flick / wheel flick 共通)。 */
const VELOCITY_WINDOW_MS = 80;
/** 慣性減衰率 (exp 減衰 / ms)。0.003 で約 1.5 秒で減速完了。 */
const INERTIA_DECAY_PER_MS = 0.003;
/** 慣性停止閾値 (deg/ms)。これ未満で停止。 */
const INERTIA_VELOCITY_MIN = 0.015;

const SchedulePicker: Component = () => {
  return (
    <Show when={pickerOpen() && pickerOrigin()}>
      {(origin) => <RingMenu origin={origin()} />}
    </Show>
  );
};

/**
 * リングメニュー本体。暗幕背景は backdrop-filter: blur(2px) + 半透明黒。open 中は chronostasis で
 * 時計画面の動的要素が全停止するため、blur は 1 回 paint されたら以降は compositing layer cache に
 * 乗って合成負荷ゼロで済む (App.tsx 側で chronostasis 発動)。
 */
const RingMenu: Component<{ origin: PickerOrigin }> = (props) => {
  const isTablet = useIsTablet();
  const isLandscape = useOrientation();
  const ringRadius = () => isTablet() ? RING_RADIUS_TABLET : RING_RADIUS_MOBILE;
  const iconSize = () => isTablet() ? ICON_SIZE_TABLET : ICON_SIZE_MOBILE;
  const iconFont = () => isTablet() ? ICON_FONT_TABLET : ICON_FONT_MOBILE;

  /** 予定が 1 件以上ある時だけ中央のりせっとボタンを出す (空のときは押せても何も起きないので隠す)。 */
  const hasAnyEvent = () => Object.keys(schedule()).length > 0;

  /** リング icon が全部出てから true。reduce-motion 時は即時 true (アニメ無し = 待つ意味無し)。 */
  const [resetButtonMounted, setResetButtonMounted] = createSignal(!motionAllowed());
  let resetMountTimer: ReturnType<typeof setTimeout> | undefined;
  onMount(() => {
    if (!motionAllowed()) return;
    resetMountTimer = setTimeout(() => setResetButtonMounted(true), RESET_BUTTON_MOUNT_DELAY_MS);
  });

  /** Stagger 起点 index。portrait=12 時、landscape=3 時 (よていボタンが画面上端でリング上半分が画面外
   *  なので、12 時から stagger すると最初の数 frame が見えない位置で動く → 画面内に確実に見える 3 時から
   *  始めて stagger を即見せる)。 */
  const staggerStartIndex = () => isLandscape() ? 3 : 0;

  let dragStart: { x: number; y: number; timeStamp: number } | null = null;
  let dragHappened = false;
  let lastAngularRad = 0;
  let velocityHistory: { time: number; deltaDeg: number }[] = [];
  let inertiaRaf: number | null = null;
  /** 慣性中のタップは「慣性キャンセル」のみで close しない (ユーザーは止めたいだけ)。 */
  let inertiaCanceledByTap = false;
  /** よていボタン pointerdown で picker が開いた直後、release 時の合成 click が overlay に飛んでくる
   *  (= 即 closePicker されてしまう)。overlay 自身が pointerdown を見た場合のみ click を有効扱いに
   *  するためのフラグ。 */
  let pointerDownOnOverlay = false;
  /** pointerdown 座標を click ハンドラまで持ち越す。dragStart は pointerup で null 化されるので
   *  別途保持。click 時にこの座標が「リング帯」内なら隙間タップ救済として nearest icon に snap する。 */
  let pointerDownCoords: { x: number; y: number } | null = null;

  /** rAF 間引き用の累積。120Hz 端末では 1 frame 内に pointermove が複数発火し、毎回 rotatePicker を
   *  呼ぶと親要素の inline style が同フレーム内で重複書込みされる。次の rAF で 1 回だけ commit する。 */
  let pendingDelta = 0;
  let rotateRaf: number | null = null;
  const flushRotation = () => {
    rotateRaf = null;
    if (pendingDelta !== 0) {
      rotatePicker(pendingDelta);
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
      rotatePicker(pendingDelta);
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
      rotatePicker(velocity * dt);
      velocity *= Math.exp(-INERTIA_DECAY_PER_MS * dt);
      inertiaRaf = requestAnimationFrame(tick);
    };
    inertiaRaf = requestAnimationFrame(tick);
  };

  const onPointerDown = (e: PointerEvent) => {
    pointerDownOnOverlay = true;
    if (inertiaRaf !== null) {
      cancelInertia();
      inertiaCanceledByTap = true;
    }
    // wheel tween 進行中に drag 始めると tween が画面位置を上書きして指追従が壊れる。終端まで
    // ジャンプして整合を取ってから drag 開始 (tween 中に拾った wheel ぶんは "今" 当てる)。
    flushWheelTweenToTarget();
    cancelWheelIdle();
    dragStart = { x: e.clientX, y: e.clientY, timeStamp: e.timeStamp };
    pointerDownCoords = { x: e.clientX, y: e.clientY };
    dragHappened = false;
    velocityHistory = [];
    lastAngularRad = Math.atan2(e.clientY - props.origin.y, e.clientX - props.origin.x);
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

    // 画面座標は y が下向き正なので atan2 は CW で増加 → CW 回転 (+) と一致。
    const currentRad = Math.atan2(e.clientY - props.origin.y, e.clientX - props.origin.x);
    let deltaRad = currentRad - lastAngularRad;
    // ±π 跨ぎを最短経路に正規化
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

  const onPointerUp = (_e: PointerEvent) => {
    dragStart = null;
    // 慣性開始 / 停止前に rAF 保留分を取りこぼさず即時反映。
    flushPendingNow();
    // フリック離した瞬間: 直近の平均速度から慣性ループ開始 (touch / mouse / pen 共通)。
    // reduce-motion 中はスキップ。
    if (motionAllowed() && velocityHistory.length > 0) {
      const totalDeg = velocityHistory.reduce((s, h) => s + h.deltaDeg, 0);
      const oldest = velocityHistory[0]!.time;
      const span = performance.now() - oldest || 1;
      const velocity = totalDeg / span;
      if (Math.abs(velocity) >= INERTIA_VELOCITY_MIN) {
        startInertia(velocity);
      }
    }
    velocityHistory = [];
  };

  const onClick = () => {
    // よていボタンから開いた直後の合成 click は overlay 自身が pointerdown を見ていない。
    if (!pointerDownOnOverlay) return;
    pointerDownOnOverlay = false;
    if (inertiaCanceledByTap) {
      inertiaCanceledByTap = false;
      return;
    }
    if (dragHappened) {
      dragHappened = false;
      return;
    }
    // タップ位置が「リング帯」(中心からの距離が ringRadius ± iconSize) 内なら、角度的に最寄りの
    // icon に snap して登録する。アイコン本体タップは RingIcon 側 (stopPropagation) で完結するので、
    // ここに来るのは隙間タップだけ。子供がアイコン中心を外しても拾える救済路。
    if (pointerDownCoords) {
      const dx = pointerDownCoords.x - props.origin.x;
      const dy = pointerDownCoords.y - props.origin.y;
      const dist = Math.hypot(dx, dy);
      const innerRadius = ringRadius() - iconSize();
      const outerRadius = ringRadius() + iconSize();
      if (dist >= innerRadius && dist <= outerRadius) {
        const N = SCHEDULE_ICONS.length;
        const ringRotRad = pickerRotation() * Math.PI / 180;
        // RingIcon は angleRad = (i/N)*2π - π/2 で配置されるので逆算で nearest index を求める。
        // 親 ring の rotation を打ち消してからベース角度を i に戻す。
        const rawIdx = ((Math.atan2(dy, dx) - ringRotRad + Math.PI / 2) / (2 * Math.PI)) * N;
        const nearest = ((Math.round(rawIdx) % N) + N) % N;
        setScheduleAt(rotateMinutes(), SCHEDULE_ICONS[nearest]!.id);
        closePicker();
        return;
      }
    }
    closePicker();
  };

  let wheelVelocityHistory: { time: number; deltaDeg: number }[] = [];
  let wheelIdleTimer: ReturnType<typeof setTimeout> | null = null;
  const cancelWheelIdle = () => {
    if (wheelIdleTimer !== null) {
      clearTimeout(wheelIdleTimer);
      wheelIdleTimer = null;
    }
  };

  /** ホイール tween: 各 event の回転を WHEEL_TWEEN_DURATION_MS ease-out で連続的に足す。連射時は
   *  前 tween の到達途中値から新目標へ再起動 (= "ばね" っぽく追従)。target null のとき非アクティブ。 */
  let wheelTweenTarget: number | null = null;
  let wheelTweenStartTime = 0;
  let wheelTweenStartRotation = 0;
  let wheelTweenRaf: number | null = null;
  const cancelWheelTween = () => {
    if (wheelTweenRaf !== null) {
      cancelAnimationFrame(wheelTweenRaf);
      wheelTweenRaf = null;
    }
    wheelTweenTarget = null;
  };
  /** tween を残ったまま打ち切ると wheelTweenTarget までの未消化回転が "失われる" (= 慣性が
   *  足された時に画面上の picker 位置と乖離して overshoot 感)。慣性開始前 / drag 開始前に呼んで、
   *  tween 終端まで瞬時にジャンプさせて整合性を取る。 */
  const flushWheelTweenToTarget = () => {
    if (wheelTweenTarget !== null) {
      rotatePicker(wheelTweenTarget - pickerRotation());
    }
    cancelWheelTween();
  };
  const tickWheelTween = () => {
    if (wheelTweenTarget === null) {
      wheelTweenRaf = null;
      return;
    }
    const now = performance.now();
    const t = Math.min(1, (now - wheelTweenStartTime) / WHEEL_TWEEN_DURATION_MS);
    const eased = 1 - (1 - t) * (1 - t);
    const targetR = wheelTweenStartRotation + (wheelTweenTarget - wheelTweenStartRotation) * eased;
    rotatePicker(targetR - pickerRotation());
    if (t >= 1) {
      wheelTweenTarget = null;
      wheelTweenRaf = null;
      return;
    }
    wheelTweenRaf = requestAnimationFrame(tickWheelTween);
  };

  /** ホイール event ごとに tween 目標を加算 + 速度履歴を貯める。最後の event から
   *  WHEEL_IDLE_TRIGGER_MS 後に累積回転が閾値超え + 平均速度 ≥ INERTIA_VELOCITY_MIN なら慣性発火。
   *  慣性中の wheel は cancelInertia で中断 → 新規 tween → そのまま新しい慣性に繋がる (フリック追加加速)。 */
  const onWheel = (e: WheelEvent) => {
    e.preventDefault();
    cancelInertia();
    const sign = e.deltaY > 0 ? 1 : -1;
    const deltaDeg = sign * Math.abs(e.deltaY) * WHEEL_DEG_PER_DELTA;

    // tween 目標を累積。前 tween が走ってればその目標に加算、無ければ現在 rotation から開始。
    const baseTarget = wheelTweenTarget ?? pickerRotation();
    wheelTweenTarget = baseTarget + deltaDeg;
    wheelTweenStartTime = performance.now();
    wheelTweenStartRotation = pickerRotation();
    if (wheelTweenRaf === null) {
      wheelTweenRaf = requestAnimationFrame(tickWheelTween);
    }

    const now = performance.now();
    wheelVelocityHistory.push({ time: now, deltaDeg });
    const cutoff = now - VELOCITY_WINDOW_MS;
    while (wheelVelocityHistory.length > 0 && wheelVelocityHistory[0]!.time < cutoff) {
      wheelVelocityHistory.shift();
    }

    cancelWheelIdle();
    if (!motionAllowed()) return;
    wheelIdleTimer = setTimeout(() => {
      wheelIdleTimer = null;
      if (wheelVelocityHistory.length === 0) return;
      const totalDeg = wheelVelocityHistory.reduce((s, h) => s + h.deltaDeg, 0);
      const oldest = wheelVelocityHistory[0]!.time;
      wheelVelocityHistory = [];
      if (Math.abs(totalDeg) < WHEEL_INERTIA_MIN_TOTAL_DEG) return;
      // 速度はサンプル区間内の deg/ms 平均。span が 0 のときは 1ms floor で割る。
      const span = performance.now() - oldest || 1;
      const velocity = totalDeg / span;
      if (Math.abs(velocity) >= INERTIA_VELOCITY_MIN) {
        flushWheelTweenToTarget();
        startInertia(velocity);
      }
    }, WHEEL_IDLE_TRIGGER_MS);
  };

  onCleanup(() => {
    cancelInertia();
    cancelPendingRotation();
    cancelWheelIdle();
    cancelWheelTween();
    if (resetMountTimer) clearTimeout(resetMountTimer);
  });

  return (
    <div
      class="fixed inset-0 z-[100] backdrop-blur-[2px]"
      style={{
        background: "rgba(0,0,0,0.4)",
        "touch-action": "none",
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onClick={onClick}
      onWheel={onWheel}
    >
      {/* リング container: origin 中心の 0×0 要素。pickerRotation 変化時の inline style 書込みは
          ここの --ring-rot 1 個だけ。子は CSS 変数経由で counter-rotate して emoji を upright に保つ。 */}
      <div
        class="fixed"
        style={{
          left: `${props.origin.x}px`,
          top: `${props.origin.y}px`,
          width: 0,
          height: 0,
          // var() を使うことで JS が触るのは --ring-rot のみ。transform 文字列自体は静的。
          transform: "rotate(var(--ring-rot, 0deg))",
          "--ring-rot": `${pickerRotation()}deg`,
          "will-change": "transform",
        }}
      >
        <For each={SCHEDULE_ICONS}>
          {(icon, i) => (
            <RingIcon
              icon={icon}
              index={i()}
              staggerStartIndex={staggerStartIndex()}
              ringRadius={ringRadius()}
              iconSize={iconSize()}
              iconFont={iconFont()}
            />
          )}
        </For>
      </div>

      {/* 中央のりせっとボタン。よていボタンに被さる位置 (origin = よていボタン中心) に同じ pill 形で
          配置。回転リングの外に置いて回転に巻き込まれないようにする。予定 0 件のときは disabled で
          表示 (押せないし見た目もグレー)。
          リング icon が全部出るまで mount 自体を遅延 (Show で DOM に居ない) させて、よていボタン押下
          → picker open の click 合成イベントが中央に届いてりせっとを誤発火する race を防ぐ。 */}
      <Show when={resetButtonMounted()}>
        <ResetButton
          origin={props.origin}
          disabled={!hasAnyEvent()}
        />
      </Show>
    </div>
  );
};

const RingIcon: Component<{
  icon: ScheduleIconDef;
  index: number;
  /** Stagger 起点 index。この index の icon が delay 0 で最初に出現し、CW 順に続く。 */
  staggerStartIndex: number;
  ringRadius: number;
  iconSize: number;
  iconFont: number;
}> = (props) => {
  let buttonRef: HTMLButtonElement | undefined;
  const { t } = useI18n();

  /** 角度位置 (mount 時 1 回計算)。i=0 を 12 時 (-90°) からスタートして CW 並び。 */
  const angleRad = (props.index / SCHEDULE_ICONS.length) * 2 * Math.PI - Math.PI / 2;
  const x = props.ringRadius * Math.cos(angleRad);
  const y = props.ringRadius * Math.sin(angleRad);
  const offsetX = x - props.iconSize / 2;
  const offsetY = y - props.iconSize / 2;

  /** 親の rotate を打ち消して emoji を upright に保つ transform 文字列。--ring-rot 変化は CSS cascade
   *  で自動再計算されるので子の inline style 書込みはゼロ / frame。 */
  const restingTransform =
    `translate(${offsetX}px, ${offsetY}px) rotate(calc(-1 * var(--ring-rot, 0deg)))`;

  /** 開始時アニメ: origin → 角度位置 + scale 0→1 + opacity 0→1。staggerStartIndex を 0 として CW 順に
   *  出現。appearance 中は WAAPI が transform を上書きするので counter-rotate が一時的に効かない
   *  (= 開直後に高速回転すると emoji がわずかに傾く)。実用上 picker open 直後に高速回転は起きないので
   *  許容。reduce-motion 中は animateMotion が null を返してアニメスキップ → 即最終位置に出現。 */
  onMount(() => {
    if (!buttonRef) return;
    const N = SCHEDULE_ICONS.length;
    const staggerOffset = (props.index - props.staggerStartIndex + N) % N;
    const startTransform =
      `translate(${-props.iconSize / 2}px, ${-props.iconSize / 2}px) scale(0)`;
    const endTransform = `translate(${offsetX}px, ${offsetY}px) scale(1)`;
    animateMotion(
      buttonRef,
      [
        { transform: startTransform, opacity: 0 },
        { transform: endTransform, opacity: 1 },
      ],
      {
        duration: APPEAR_DURATION_MS,
        delay: staggerOffset * STAGGER_MS,
        easing: "cubic-bezier(.34,1.56,.64,1)",
        fill: "backwards",
      },
    );
  });

  const onClick = (e: MouseEvent) => {
    e.stopPropagation();
    setScheduleAt(rotateMinutes(), props.icon.id);
    closePicker();
  };

  return (
    <button
      ref={buttonRef}
      class="absolute top-0 left-0 rounded-full bg-white shadow-lg flex items-center justify-center before:hidden"
      style={{
        width: `${props.iconSize}px`,
        height: `${props.iconSize}px`,
        "font-size": `${props.iconFont}px`,
        transform: restingTransform,
        // 各アイコンを GPU layer に固定 → 親 rotate と自分の counter-rotate が composite-only で
        // 完結し、毎 frame 再ラスタライズなしで動く。
        "will-change": "transform",
      }}
      onClick={onClick}
      aria-label={t(`schedule.icon.${props.icon.id}` as TKey)}
    >
      {props.icon.emoji}
    </button>
  );
};

/**
 * リング中央のりせっとボタン。よていボタンと同じ pill 形 (横長、改行なし) で同じ位置に重ねる。
 * aria-label の文字をグローバル ::before で描画 (index.css の `button[aria-label]::before` 参照)。
 * クリックで全予定を warning 状態に入れて picker を閉じる。disabled (予定 0 件) のときはグレーで
 * 表示し click も無効。padding/text-size は SettingsPanel の btnClass と揃える。
 */
const ResetButton: Component<{
  origin: PickerOrigin;
  disabled: boolean;
}> = (props) => {
  let buttonRef: HTMLButtonElement | undefined;
  const { t } = useI18n();

  /** 出現アニメ: scale 0→1。中央位置は固定なので translate は最終 transform と同じ。 */
  onMount(() => {
    if (!buttonRef) return;
    animateMotion(
      buttonRef,
      [
        { transform: "translate(-50%, -50%) scale(0)", opacity: 0 },
        { transform: "translate(-50%, -50%) scale(1)", opacity: 1 },
      ],
      {
        duration: APPEAR_DURATION_MS,
        easing: "cubic-bezier(.34,1.56,.64,1)",
        fill: "backwards",
      },
    );
  });

  /** overlay の drag/click ハンドラに巻き込まれないよう pointerdown も click も止める
   *  (disabled でも click は飛んでこないが pointerdown は飛ぶので overlay に届かないように)。 */
  const onPointerDown = (e: PointerEvent) => {
    e.stopPropagation();
  };

  /** disabled だと click 自体ブラウザで発火しないので分岐は防御目的のみ。 */
  const onClick = (e: MouseEvent) => {
    e.stopPropagation();
    if (props.disabled) return;
    closePicker();
    enterResetWarning();
  };

  return (
    <button
      ref={buttonRef}
      class="fixed px-2.5 py-1 tablet:px-6 tablet:py-4 rounded-full text-base tablet:text-xl font-bold whitespace-nowrap"
      style={{
        left: `${props.origin.x}px`,
        top: `${props.origin.y}px`,
        transform: "translate(-50%, -50%)",
        // disabled でも opaque (よていボタンに被せるので透けると下のラベルが透けて見える)。
        background: props.disabled ? "#f3f4f6" : "#ffffff",
        color: props.disabled ? "#9ca3af" : "#C01030",
        border: `2px solid ${props.disabled ? "#d1d5db" : "#FF4060"}`,
        "box-shadow": props.disabled ? "none" : "0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)",
        cursor: props.disabled ? "not-allowed" : "pointer",
        "will-change": "transform",
      }}
      onPointerDown={onPointerDown}
      onClick={onClick}
      disabled={props.disabled}
      aria-label={t("schedule.reset")}
    />
  );
};

export default SchedulePicker;
