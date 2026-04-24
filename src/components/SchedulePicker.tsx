import { For, Show, createMemo, onMount } from "solid-js";
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

  const onPointerDown = (e: PointerEvent) => {
    dragStart = { x: e.clientX, y: e.clientY };
    dragHappened = false;
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
    rotatePicker(sign * dist * DRAG_DEG_PER_PX);

    // インクリメンタル化 (次の move で再計測)
    dragStart = { x: e.clientX, y: e.clientY };
  };

  const onPointerUp = () => {
    dragStart = null;
  };

  const onClick = (e: MouseEvent) => {
    // ドラッグだった場合は close 抑制
    if (dragHappened) {
      dragHappened = false;
      return;
    }
    closePicker();
  };

  // マウスホイール: 下スクロール → CW、上スクロール → CCW (ドラッグの右/下と同じ方向)
  const onWheel = (e: WheelEvent) => {
    e.preventDefault();
    const sign = e.deltaY > 0 ? 1 : -1;
    rotatePicker(sign * Math.abs(e.deltaY) * WHEEL_DEG_PER_DELTA);
  };

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
  onMount(() => {
    if (!buttonRef) return;
    const startTransform =
      `translate(${props.origin.x - props.iconSize / 2}px, ${props.origin.y - props.iconSize / 2}px) scale(0)`;
    const endTransform =
      `translate(${finalPos().x - props.iconSize / 2}px, ${finalPos().y - props.iconSize / 2}px) scale(1)`;
    buttonRef.animate(
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
      aria-label={props.icon.label}
    >
      {props.icon.emoji}
    </button>
  );
};

export default SchedulePicker;
