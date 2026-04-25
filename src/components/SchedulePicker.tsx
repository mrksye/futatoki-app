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
 *   - ドラッグ回転: origin 中心の角度差をそのまま回転に渡す (画面のどこでも全域 angular)。
 *                   一周なぞれば 360° 回る、ハンドルを回すような感触
 *   - マウスホイール: 別枠で deltaY を回転に渡す (慣性なし)
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
  // dragStart は tap/drag 閾値判定用、lastAngularRad は origin 基準の前回角度 (rad)
  let dragStart: { x: number; y: number } | null = null;
  let dragHappened = false;
  let lastAngularRad = 0;
  // 慣性 (touch flick で離した後に余韻で回し続ける) 用
  let velocityHistory: { time: number; deltaDeg: number }[] = [];
  let inertiaRaf: number | null = null;
  // 慣性中のタップは「慣性キャンセル」のみで close しない (= ユーザーは止めたいだけ)
  let inertiaCanceledByTap = false;
  // よていボタンの pointerdown で picker が開いた直後、release 時の合成 click が
  // overlay に飛んできて即 closePicker されるのを防ぐ。
  // = 「pointerdown を overlay 自身が受け取った場合だけ click を有効に扱う」
  let pointerDownOnOverlay = false;

  // === rAF 間引き ===
  // 120Hz 端末では 1 frame に pointermove が複数発火することがあり、毎回 rotatePicker を
  // 呼ぶとリング親要素の inline style が 1 frame 内で重複書込みされる。pendingDelta に貯めて
  // 次の rAF で 1 回だけ commit することで、書込みを必ず 1 frame 1 回に固定する。
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
    // 慣性中のタップ: 慣性キャンセル + close 抑制フラグを立てる
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

    // origin 中心の角度差をそのまま回転に渡す。
    // 画面座標は y が下向き正なので atan2 は CW で増加し、CW 回転 (+) と一致する
    const currentRad = Math.atan2(e.clientY - props.origin.y, e.clientX - props.origin.x);
    let deltaRad = currentRad - lastAngularRad;
    // ±π 跨ぎを最短経路に正規化
    if (deltaRad > Math.PI) deltaRad -= 2 * Math.PI;
    else if (deltaRad < -Math.PI) deltaRad += 2 * Math.PI;
    const deltaDeg = (deltaRad * 180) / Math.PI;
    lastAngularRad = currentRad;
    scheduleRotation(deltaDeg);

    // 速度履歴を記録 (直近 VELOCITY_WINDOW_MS のみ保持)
    const now = performance.now();
    velocityHistory.push({ time: now, deltaDeg });
    const cutoff = now - VELOCITY_WINDOW_MS;
    while (velocityHistory.length > 0 && velocityHistory[0]!.time < cutoff) {
      velocityHistory.shift();
    }
  };

  const onPointerUp = (e: PointerEvent) => {
    dragStart = null;
    // 慣性 / 静止状態に入る前に rAF 保留分を取りこぼさず即時反映
    flushPendingNow();
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
  // (smooth-scroll のホイール event も rAF 間引きで 1 frame 1 commit に揃える)
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

  // 暗幕背景は backdrop-filter: blur(2px) + 半透明黒の overlay。
  // open 中は features/freeze の clockFrozen() で時計画面の動的要素 (秒バー / hands /
  // 太陽月 / 自動回転 / 星 twinkle) が全て止まるので、blur は 1 回 paint されたら以降は
  // ブラウザの compositing layer cache に乗って合成負荷ゼロ → 古い端末でも実用負荷で動く。
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
      {/* リング container: origin 中心の 0×0 要素。
          pickerRotation 変化時の inline style 書込みは ここの --ring-rot 1 個だけになる。
          子アイコンは container 内の固定座標で配置され、CSS 変数経由で counter-rotate して
          emoji を upright に保つ (ブラウザの cascade で 1 回の var 更新が全子に伝播)。 */}
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
  ringRadius: number;
  iconSize: number;
  iconFont: number;
}> = (props) => {
  let buttonRef: HTMLButtonElement | undefined;
  const { t } = useI18n();

  // 角度位置は static (mount 時に 1 回計算)。
  // i=0 を 12 時 (-90°) からスタート、CW に並ぶ。
  // リング全体の回転は親の transform: rotate(var(--ring-rot)) で行うので、
  // 子はここで決まった座標から動かない。
  const angleRad = (props.index / SCHEDULE_ICONS.length) * 2 * Math.PI - Math.PI / 2;
  const x = props.ringRadius * Math.cos(angleRad);
  const y = props.ringRadius * Math.sin(angleRad);
  const offsetX = x - props.iconSize / 2;
  const offsetY = y - props.iconSize / 2;
  // 親の rotate を打ち消して emoji を upright に保つ (CSS 変数 --ring-rot は親が供給)。
  // この transform 文字列自体は static で JS は触らない。--ring-rot 変化時は CSS の cascade で
  // 自動的に再計算される (= 子の inline style 書込み 0 回 / frame)。
  const restingTransform =
    `translate(${offsetX}px, ${offsetY}px) rotate(calc(-1 * var(--ring-rot, 0deg)))`;

  // 開始時アニメ: 親 origin (= translate(-size/2)) → 角度位置 + scale 0 → 1 + opacity 0 → 1。
  // stagger は index * STAGGER_MS で 12 時から CW 順次出現。
  // appearance 中は WAAPI が transform を上書きするので counter-rotate は一時的に効かない
  // (= 開いた直後の数百 ms に高速回転すると emoji がわずかに傾く)。実用上は picker open 直後に
  // 高速回転は起きないので許容する。アニメ終了後は inline style の restingTransform に戻り、
  // 以降は --ring-rot 変化に追従する。
  // (reduce-motion 中は animateMotion が null を返してアニメスキップ → 即最終位置に出現)
  onMount(() => {
    if (!buttonRef) return;
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
      class="absolute top-0 left-0 rounded-full bg-white shadow-lg flex items-center justify-center before:hidden"
      style={{
        width: `${props.iconSize}px`,
        height: `${props.iconSize}px`,
        "font-size": `${props.iconFont}px`,
        transform: restingTransform,
        // 各アイコンを GPU layer に固定。親 rotate と自分の counter-rotate が
        // composite-only で完結するため、毎 frame 再ラスタライズなしで動く。
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
