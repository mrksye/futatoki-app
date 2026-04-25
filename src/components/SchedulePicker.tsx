import { For, Show, createMemo, onCleanup, onMount } from "solid-js";
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
import { useI18n, type TKey } from "../i18n";
import { animateMotion, motionAllowed } from "../lib/motion";

/**
 * 予定アイコン選択用リングメニュー。
 *
 * 構造:
 *   - Overlay: 画面全体の半透明レイヤー
 *   - リング: 11 個のアイコンが半径 RING_RADIUS で円周上に配置
 *   - 開閉アニメ: タップ位置 → 各アイコンの最終位置に放射状にニュッと出る
 *                 stagger 30ms で右回り順 (12時から CW)
 *   - ドラッグ回転: 右/下 → CW、左/上 → CCW
 *   - アイコンタップ → 現在の rotateMinutes() に予定追加 + 閉じる
 *   - Overlay 空タップ → 閉じる
 */

// SettingsPanel の四隅ボタンと同じ tablet ブレイクポイントで大きくする
const RING_RADIUS_MOBILE = 110;
const RING_RADIUS_TABLET = 160;
const ICON_SIZE_MOBILE = 44;
const ICON_SIZE_TABLET = 64;
const ICON_FONT_MOBILE = 26;
const ICON_FONT_TABLET = 38;
const STAGGER_MS = 30;
const APPEAR_DURATION_MS = 280;

/** 「ドラッグ」と「タップ」を区別する閾値 (px) */
const DRAG_THRESHOLD_PX = 5;
/** ドラッグ感度 (画面 1px 移動 → リング n° 回転) */
const DRAG_DEG_PER_PX = 0.2;
/** マウスホイール感度 (deltaY 1 単位 → リング n° 回転) */
const WHEEL_DEG_PER_DELTA = 0.1;

/** 慣性計算: 直近 N ms の速度サンプルから初速度を出す (touch flick 用) */
const VELOCITY_WINDOW_MS = 80;
/** 慣性減衰率 (exp 減衰、per ms)。大きいほど早く止まる。0.003 で約 1.5 秒で減速完了 */
const INERTIA_DECAY_PER_MS = 0.003;
/** 慣性停止閾値 (deg/ms)。これ未満になったら停止 */
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
  const ringRadius = () => isTablet() ? RING_RADIUS_TABLET : RING_RADIUS_MOBILE;
  const iconSize = () => isTablet() ? ICON_SIZE_TABLET : ICON_SIZE_MOBILE;
  const iconFont = () => isTablet() ? ICON_FONT_TABLET : ICON_FONT_MOBILE;

  // ドラッグ状態 (= 「タップで閉じる」と「ドラッグで回転」の区別に使う)
  let dragStart: { x: number; y: number } | null = null;
  let dragHappened = false;
  // 慣性 (touch flick で離した後に余韻で回し続ける) 用
  let velocityHistory: { time: number; deltaDeg: number }[] = [];
  let inertiaRaf: number | null = null;
  // 慣性中のタップは「慣性キャンセル」のみで close しない (= ユーザーは止めたいだけ)
  let inertiaCanceledByTap = false;
  // よていボタンの pointerdown で picker が開いた直後、release 時の合成 click が
  // overlay に飛んできて即 closePicker されるのを防ぐ。
  // = 「pointerdown を overlay 自身が受け取った場合だけ click を有効に扱う」
  let pointerDownOnOverlay = false;

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
    // 慣性中のタップ: 慣性キャンセル + close 抑制フラグを立てる
    if (inertiaRaf !== null) {
      cancelInertia();
      inertiaCanceledByTap = true;
    }
    dragStart = { x: e.clientX, y: e.clientY };
    dragHappened = false;
    velocityHistory = [];
  };

  const onPointerMove = (e: PointerEvent) => {
    if (!dragStart) return;
    const dx = e.clientX - dragStart.x;
    const dy = e.clientY - dragStart.y;
    const dist = Math.hypot(dx, dy);
    if (!dragHappened && dist < DRAG_THRESHOLD_PX) return;
    dragHappened = true;

    // 主要方向で回転方向を決定: 右/下 → CW (+), 左/上 → CCW (-)
    const sign = Math.abs(dx) > Math.abs(dy)
      ? (dx > 0 ? 1 : -1)
      : (dy > 0 ? 1 : -1);
    const deltaDeg = sign * dist * DRAG_DEG_PER_PX;
    rotatePicker(deltaDeg);

    // 速度履歴を記録 (直近 VELOCITY_WINDOW_MS のみ保持)
    const now = performance.now();
    velocityHistory.push({ time: now, deltaDeg });
    const cutoff = now - VELOCITY_WINDOW_MS;
    while (velocityHistory.length > 0 && velocityHistory[0]!.time < cutoff) {
      velocityHistory.shift();
    }

    // インクリメンタル化 (次の move で再計測)
    dragStart = { x: e.clientX, y: e.clientY };
  };

  const onPointerUp = (e: PointerEvent) => {
    dragStart = null;
    // touch flick で離した瞬間: 直近の平均速度から慣性ループ開始
    // (mouse/pen は慣性なし。ホイールで操作する想定。reduce-motion 中もスキップ)
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
    // pointerdown を overlay 自身が見ていない (= よていボタンから開いた直後の合成 click) なら無視
    if (!pointerDownOnOverlay) return;
    pointerDownOnOverlay = false;
    // 慣性キャンセルのためのタップは close しない
    if (inertiaCanceledByTap) {
      inertiaCanceledByTap = false;
      return;
    }
    // ドラッグだった場合も close 抑制
    if (dragHappened) {
      dragHappened = false;
      return;
    }
    closePicker();
  };

  // マウスホイール: 下スクロール → CW、上スクロール → CCW
  // ホイール操作は慣性無し。慣性中のホイールはキャンセルしてから新規回転。
  const onWheel = (e: WheelEvent) => {
    e.preventDefault();
    cancelInertia();
    const sign = e.deltaY > 0 ? 1 : -1;
    rotatePicker(sign * Math.abs(e.deltaY) * WHEEL_DEG_PER_DELTA);
  };

  onCleanup(() => cancelInertia());

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
      <For each={SCHEDULE_ICONS}>
        {(icon, i) => (
          <RingIcon
            icon={icon}
            index={i()}
            origin={props.origin}
            ringRadius={ringRadius()}
            iconSize={iconSize()}
            iconFont={iconFont()}
          />
        )}
      </For>
    </div>
  );
};

const RingIcon: Component<{
  icon: ScheduleIconDef;
  index: number;
  origin: PickerOrigin;
  ringRadius: number;
  iconSize: number;
  iconFont: number;
}> = (props) => {
  let buttonRef: HTMLButtonElement | undefined;
  const { t } = useI18n();

  // i=0 を 12時 (-90deg) からスタート、CW に並ぶ
  const angleDeg = createMemo(() =>
    (props.index / SCHEDULE_ICONS.length) * 360 + pickerRotation() - 90
  );
  const finalPos = createMemo(() => {
    const a = angleDeg();
    const rad = (a * Math.PI) / 180;
    return {
      x: props.origin.x + props.ringRadius * Math.cos(rad),
      y: props.origin.y + props.ringRadius * Math.sin(rad),
    };
  });

  // 各アイコンは fixed で left:0/top:0、translate で目標位置へ。
  // rotation 変化は Solid のリアクティブ更新で transform が再計算される (CSS animation 不要)。
  const transform = () =>
    `translate(${finalPos().x - props.iconSize / 2}px, ${finalPos().y - props.iconSize / 2}px)`;

  // 開始時アニメ: タップ位置 (origin) → 最終位置 + scale 0 → 1 + opacity 0 → 1
  // stagger は index * STAGGER_MS で、12時から CW に順次出現する
  // (reduce-motion 中は animateMotion が null を返してアニメスキップ → アイコンは最終位置に即出現)
  onMount(() => {
    if (!buttonRef) return;
    const startTransform =
      `translate(${props.origin.x - props.iconSize / 2}px, ${props.origin.y - props.iconSize / 2}px) scale(0)`;
    const endTransform =
      `translate(${finalPos().x - props.iconSize / 2}px, ${finalPos().y - props.iconSize / 2}px) scale(1)`;
    animateMotion(
      buttonRef,
      [
        { transform: startTransform, opacity: 0 },
        { transform: endTransform, opacity: 1 },
      ],
      {
        duration: APPEAR_DURATION_MS,
        delay: props.index * STAGGER_MS,
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
      class="fixed top-0 left-0 rounded-full bg-white shadow-lg flex items-center justify-center before:hidden"
      style={{
        width: `${props.iconSize}px`,
        height: `${props.iconSize}px`,
        "font-size": `${props.iconFont}px`,
        transform: transform(),
      }}
      onClick={onClick}
      aria-label={t(`schedule.icon.${props.icon.id}` as TKey)}
    >
      {props.icon.emoji}
    </button>
  );
};

export default SchedulePicker;
