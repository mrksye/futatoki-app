import { For, Show, onCleanup, onMount } from "solid-js";
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
import { setScheduleAt } from "../features/schedule/state";
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
 */

// SettingsPanel の四隅ボタンと同じ tablet ブレイクポイントで大きくする。
const RING_RADIUS_MOBILE = 110;
const RING_RADIUS_TABLET = 160;
const ICON_SIZE_MOBILE = 44;
const ICON_SIZE_TABLET = 64;
const ICON_FONT_MOBILE = 26;
const ICON_FONT_TABLET = 38;
const STAGGER_MS = 30;
const APPEAR_DURATION_MS = 280;

/** 「ドラッグ」と「タップ」を区別する閾値 (px)。 */
const DRAG_THRESHOLD_PX = 5;
/** マウスホイール感度 (deltaY 1 単位 → リング n° 回転)。 */
const WHEEL_DEG_PER_DELTA = 0.1;

/** 慣性: 直近 N ms の速度サンプルから初速度を出す (touch flick 用)。 */
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

const RingMenu: Component<{ origin: PickerOrigin }> = (props) => {
  const isTablet = useIsTablet();
  const isLandscape = useOrientation();
  const ringRadius = () => isTablet() ? RING_RADIUS_TABLET : RING_RADIUS_MOBILE;
  const iconSize = () => isTablet() ? ICON_SIZE_TABLET : ICON_SIZE_MOBILE;
  const iconFont = () => isTablet() ? ICON_FONT_TABLET : ICON_FONT_MOBILE;

  // Stagger 起点: portrait は 12 時 (index 0)、landscape は 3 時 (index 3)。
  // landscape ではよていボタンが画面上にありリングの上半分が画面外にはみ出るので、12 時から
  // stagger すると最初の数 frame が見えない場所で動く。3 時方向から始めて画面内で stagger を即見せる。
  const staggerStartIndex = () => isLandscape() ? 3 : 0;

  let dragStart: { x: number; y: number } | null = null;
  let dragHappened = false;
  let lastAngularRad = 0;
  let velocityHistory: { time: number; deltaDeg: number }[] = [];
  let inertiaRaf: number | null = null;
  // 慣性中のタップは「慣性キャンセル」のみで close しない (ユーザーは止めたいだけ)。
  let inertiaCanceledByTap = false;
  // よていボタンの pointerdown で picker が開いた直後、release 時の合成 click が overlay に
  // 飛んできて即 closePicker されるのを防ぐ (= overlay 自身が pointerdown を見た場合のみ click 有効)。
  let pointerDownOnOverlay = false;

  // === rAF 間引き ===
  // 120Hz 端末では 1 frame に pointermove が複数発火し、毎回 rotatePicker を呼ぶと親要素の inline style が
  // 1 frame 内で重複書込みされる。pendingDelta に貯めて次の rAF で 1 回だけ commit。
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
    dragStart = { x: e.clientX, y: e.clientY };
    dragHappened = false;
    velocityHistory = [];
    lastAngularRad = Math.atan2(e.clientY - props.origin.y, e.clientX - props.origin.x);
  };

  const onPointerMove = (e: PointerEvent) => {
    if (!dragStart) return;
    if (!dragHappened) {
      const dist = Math.hypot(e.clientX - dragStart.x, e.clientY - dragStart.y);
      if (dist < DRAG_THRESHOLD_PX) return;
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

  const onPointerUp = (e: PointerEvent) => {
    dragStart = null;
    // 慣性開始 / 停止前に rAF 保留分を取りこぼさず即時反映。
    flushPendingNow();
    // touch flick 離した瞬間: 直近の平均速度から慣性ループ開始。
    // mouse/pen は慣性なし (ホイールで操作する想定)。reduce-motion 中もスキップ。
    if (e.pointerType === "touch" && motionAllowed() && velocityHistory.length > 0) {
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
    closePicker();
  };

  // ホイール操作は慣性無し。慣性中のホイールはキャンセルしてから新規回転。
  const onWheel = (e: WheelEvent) => {
    e.preventDefault();
    cancelInertia();
    const sign = e.deltaY > 0 ? 1 : -1;
    scheduleRotation(sign * Math.abs(e.deltaY) * WHEEL_DEG_PER_DELTA);
  };

  onCleanup(() => {
    cancelInertia();
    cancelPendingRotation();
  });

  // 暗幕背景は backdrop-filter: blur(2px) + 半透明黒。open 中は chronostasis で時計画面の動的要素が
  // 全停止するため、blur は 1 回 paint されたら以降は compositing layer cache に乗って合成負荷ゼロ。
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

  // 角度位置は static (mount 時 1 回計算)。i=0 を 12 時 (-90°) からスタート、CW 並び。
  const angleRad = (props.index / SCHEDULE_ICONS.length) * 2 * Math.PI - Math.PI / 2;
  const x = props.ringRadius * Math.cos(angleRad);
  const y = props.ringRadius * Math.sin(angleRad);
  const offsetX = x - props.iconSize / 2;
  const offsetY = y - props.iconSize / 2;
  // 親の rotate を打ち消して emoji を upright に保つ。--ring-rot 変化は CSS cascade で自動再計算
  // されるので子の inline style 書込みはゼロ / frame。
  const restingTransform =
    `translate(${offsetX}px, ${offsetY}px) rotate(calc(-1 * var(--ring-rot, 0deg)))`;

  // 開始時アニメ: origin → 角度位置 + scale 0→1 + opacity 0→1。staggerStartIndex を 0 として CW 順に出現。
  // appearance 中は WAAPI が transform を上書きするので counter-rotate が一時的に効かない (= 開直後に
  // 高速回転すると emoji がわずかに傾く)。実用上 picker open 直後に高速回転は起きないので許容。
  // reduce-motion 中は animateMotion が null を返してアニメスキップ → 即最終位置に出現。
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

export default SchedulePicker;
