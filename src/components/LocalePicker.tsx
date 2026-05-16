import { For, Show, createMemo, createSignal, onCleanup, onMount } from "solid-js";
import type { Component } from "solid-js";
import { SUPPORTED_LOCALES, type LocaleMeta } from "../i18n/locales";
import { LOCALE_FLAG, switchLocaleByReload } from "../features/locale-picker/flags";
import {
  localePickerOpen,
  localePickerOrigin,
  localePickerLengthOffset,
  closeLocalePicker,
  rotateLocalePicker,
  setLocalePickerLengthOffset,
  type LocalePickerOrigin,
} from "../features/locale-picker/state";
import { useIsTablet } from "../hooks/useIsTablet";
import { useOrientation } from "../hooks/useOrientation";
import { useViewport } from "../hooks/useViewport";
import { useI18n } from "../i18n";
import { animateMotion, motionAllowed } from "../lib/motion";

/**
 * 言語選択リングメニュー。trigger (= 左上の国旗ボタン) を起点に、SUPPORTED_LOCALES を角丸四角
 * (stadium) path 上に等間隔配置する。drag / wheel / 慣性で path 上の length offset が進み、
 * アイテムが自転車のチェーンのように回る。ActivityPicker (円形) と同型の操作系を stadium 形に
 * 置き換えた構造。
 */

const ICON_SIZE_MOBILE = 52;
const ICON_SIZE_TABLET = 72;
const ICON_FONT_MOBILE = 30;
const ICON_FONT_TABLET = 42;
const ICON_GAP_MOBILE = 8;
const ICON_GAP_TABLET = 12;
const RING_LONG_RATIO = 1.5;
/** 0.5 で短辺方向が完全な半円 = stadium / pill 形になり、自転車のチェーンっぽい滑らかな曲線で
 *  回転する。 */
const CORNER_RATIO = 0.5;
/** ring center を origin から viewport 長辺方向に push する量 (ring 長辺 * これ)。値を上げるほど
 *  ring が画面外に押し出されて visible 範囲が狭まる。 */
const RING_CENTER_OUTSET_RATIO = 0.15;
/** stadium 形 (CORNER_RATIO=0.5) の周長 = short * (2*longRatio + π - 2)。item 間隔から ring 短辺
 *  を逆算するための divisor。 */
const RING_PERIMETER_DIVISOR = 2 * RING_LONG_RATIO + Math.PI - 2;

const STAGGER_MS = 30;
const APPEAR_DURATION_MS = 280;
/** SUPPORTED_LOCALES の先頭付近 (en, ja, ...) で開いた時に「自分より前」がほぼ無く CW stagger の
 *  手前側がスカスカになるので、配列を末尾から rotate して常にこの数だけ前置近隣を確保する。 */
const REQUIRED_LEFT_NEIGHBORS = 5;
/** stagger 起点を現在 locale より前にずらす数。現在 locale を真っ先に出すと「自分を再選択する」
 *  ような不自然感が出るので少し後ろに置き、周囲を先に見せる。4 で現在 locale が 5 番目に登場。 */
const CURRENT_STAGGER_PRECEDING = 4;

const DRAG_THRESHOLD_FAST_PX = 2;
const DRAG_THRESHOLD_SLOW_PX = 6;
const DRAG_FAST_WINDOW_MS = 80;

/** Chrome デフォルト 1 ノッチ deltaY ≈ 100 なので 0.4 で 1 ノッチ ≈ 0.66 アイテム移動。1.0 だと
 *  1 ノッチで 1 アイテム以上飛んで速すぎる。 */
const WHEEL_LENGTH_PER_DELTA = 0.4;
const WHEEL_TWEEN_DURATION_MS = 200;
const WHEEL_IDLE_TRIGGER_MS = 100;
/** 1 ノッチ程度では発火させずフリック級のみで慣性を起こす閾値 (直近窓内の累積 length px)。 */
const WHEEL_INERTIA_MIN_TOTAL_PX = 80;

const VELOCITY_WINDOW_MS = 80;
const INERTIA_DECAY_PER_MS = 0.003;
const INERTIA_VELOCITY_MIN = 0.05;

const LocalePicker: Component = () => {
  return (
    <Show when={localePickerOpen() && localePickerOrigin()}>
      {(origin) => <LocaleRingMenu origin={origin()} />}
    </Show>
  );
};

const LocaleRingMenu: Component<{ origin: LocalePickerOrigin }> = (props) => {
  const isTablet = useIsTablet();
  const isLandscape = useOrientation();
  const viewport = useViewport();
  const { locale } = useI18n();
  const iconSize = () => isTablet() ? ICON_SIZE_TABLET : ICON_SIZE_MOBILE;
  const iconFont = () => isTablet() ? ICON_FONT_TABLET : ICON_FONT_MOBILE;

  /** item 間隔 (icon + gap) * N が周長になるよう ring 短辺を逆算するので、gap を変えれば ring が
   *  自動で伸び縮みする。viewport 向きに追従して長辺/短辺を割り当てる。 */
  const itemSpacing = () => iconSize() + (isTablet() ? ICON_GAP_TABLET : ICON_GAP_MOBILE);
  const ringShort = () => SUPPORTED_LOCALES.length * itemSpacing() / RING_PERIMETER_DIVISOR;
  const ringLong = () => ringShort() * RING_LONG_RATIO;
  const ringW = () => isLandscape() ? ringLong() : ringShort();
  const ringH = () => isLandscape() ? ringShort() : ringLong();
  const cornerR = () => ringShort() * CORNER_RATIO;

  /** ring center を viewport 長辺方向 (landscape=-x、portrait=-y) に push して画面外に押し出し、
   *  可視範囲を短辺方向の細い帯に絞る。 */
  const outsetPx = () => ringLong() * RING_CENTER_OUTSET_RATIO;
  const ringCx = () => isLandscape() ? props.origin.x - outsetPx() : props.origin.x;
  const ringCy = () => isLandscape() ? props.origin.y : props.origin.y - outsetPx();

  /** path-local 座標 (0,0)-(W,H) で CW 順に描く stadium path。length 0 = 左上 corner 角丸の終点
   *  なので、length 0.5L = 開始点の対角 ≈ 右下 corner となり initial offset の基準に使える。 */
  const pathD = createMemo(() => {
    const W = ringW();
    const H = ringH();
    const R = cornerR();
    return [
      `M ${R} 0`,
      `H ${W - R}`,
      `A ${R} ${R} 0 0 1 ${W} ${R}`,
      `V ${H - R}`,
      `A ${R} ${R} 0 0 1 ${W - R} ${H}`,
      `H ${R}`,
      `A ${R} ${R} 0 0 1 0 ${H - R}`,
      `V ${R}`,
      `A ${R} ${R} 0 0 1 ${R} 0`,
      `Z`,
    ].join(" ");
  });

  /** detached SVG path 要素を計測専用に作る。Solid の <path> ref を width=0 SVG 内に置くと
   *  Chromium で getTotalLength = 0 になる既知挙動の回避 (geometry は d 属性のみ依存)。 */
  const measurePath = createMemo(() => {
    const NS = "http://www.w3.org/2000/svg";
    const el = document.createElementNS(NS, "path") as SVGPathElement;
    el.setAttribute("d", pathD());
    return el;
  });

  const totalLength = createMemo(() => measurePath().getTotalLength());

  const rawCurrentIndex = SUPPORTED_LOCALES.findIndex(l => l.code === locale().code);

  /** 現在 locale より前に REQUIRED_LEFT_NEIGHBORS 個の近隣を確保するため、必要なら配列末尾を
   *  先頭に rotate する。en (idx 0) なら末尾 5 個 (fa, ur, hi, bn, id) が先頭に来て en は新 idx 5。
   *  これで stagger・initial offset を index 単位で素直に扱える。 */
  const orderedLocales = (() => {
    if (rawCurrentIndex < 0) return SUPPORTED_LOCALES;
    const shortage = REQUIRED_LEFT_NEIGHBORS - rawCurrentIndex;
    if (shortage <= 0) return SUPPORTED_LOCALES;
    const N = SUPPORTED_LOCALES.length;
    return [
      ...SUPPORTED_LOCALES.slice(N - shortage),
      ...SUPPORTED_LOCALES.slice(0, N - shortage),
    ];
  })();

  const currentLocaleIndex = rawCurrentIndex < 0
    ? -1
    : orderedLocales.findIndex(l => l.code === locale().code);

  /** 現在 locale を visible 範囲中央に揃える length offset を setup phase で set する。子 LocaleIcon
   *  の onMount より前に確定させないと、出現アニメの end keyframe が古い position で固定されて
   *  しまう (Solid の onMount で rotate しても間に合わない)。 */
  if (currentLocaleIndex >= 0) {
    const L = totalLength();
    if (L > 0) {
      const stepLength = L / orderedLocales.length;
      setLocalePickerLengthOffset(L * 0.5 - currentLocaleIndex * stepLength);
    }
  }

  let dragStart: { x: number; y: number; timeStamp: number } | null = null;
  let dragHappened = false;
  let lastPointerX = 0;
  let lastPointerY = 0;
  let velocityHistory: { time: number; deltaPx: number }[] = [];
  let inertiaRaf: number | null = null;
  let inertiaCanceledByTap = false;
  let pointerDownOnOverlay = false;

  /** rAF 間引き: 120Hz 端末で 1 frame 内に複数 pointermove が来ても 1 回だけ commit する。 */
  let pendingDelta = 0;
  let rotateRaf: number | null = null;
  const flushRotation = () => {
    rotateRaf = null;
    if (pendingDelta !== 0) {
      rotateLocalePicker(pendingDelta);
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
      rotateLocalePicker(pendingDelta);
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

  const startInertia = (initialVelocityPxPerMs: number) => {
    cancelInertia();
    let velocity = initialVelocityPxPerMs;
    let lastTime = performance.now();
    const tick = (now: number) => {
      const dt = now - lastTime;
      lastTime = now;
      if (Math.abs(velocity) < INERTIA_VELOCITY_MIN) {
        inertiaRaf = null;
        return;
      }
      rotateLocalePicker(velocity * dt);
      velocity *= Math.exp(-INERTIA_DECAY_PER_MS * dt);
      inertiaRaf = requestAnimationFrame(tick);
    };
    inertiaRaf = requestAnimationFrame(tick);
  };

  /** pointer の displacement を、ring 中心から pointer へのベクトル v の CCW 接線方向
   *  (-vy, vx)/|v| に投影して length 増分に変換する。chain conveyor を「指を引いた方向に流す」
   *  直感に揃えるため CCW 接線を選んでいる (CW にすると見た目逆に動く)。 */
  const pointerDeltaToLength = (px: number, py: number, dx: number, dy: number): number => {
    const vx = px - ringCx();
    const vy = py - ringCy();
    const vMag = Math.hypot(vx, vy);
    if (vMag === 0) return 0;
    const tangentX = -vy / vMag;
    const tangentY = vx / vMag;
    return dx * tangentX + dy * tangentY;
  };

  const onPointerDown = (e: PointerEvent) => {
    pointerDownOnOverlay = true;
    if (inertiaRaf !== null) {
      cancelInertia();
      inertiaCanceledByTap = true;
    }
    flushWheelTweenToTarget();
    cancelWheelIdle();
    dragStart = { x: e.clientX, y: e.clientY, timeStamp: e.timeStamp };
    dragHappened = false;
    velocityHistory = [];
    lastPointerX = e.clientX;
    lastPointerY = e.clientY;
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

    const dx = e.clientX - lastPointerX;
    const dy = e.clientY - lastPointerY;
    const deltaPx = pointerDeltaToLength(e.clientX, e.clientY, dx, dy);
    lastPointerX = e.clientX;
    lastPointerY = e.clientY;
    scheduleRotation(deltaPx);

    const now = performance.now();
    velocityHistory.push({ time: now, deltaPx });
    const cutoff = now - VELOCITY_WINDOW_MS;
    while (velocityHistory.length > 0 && velocityHistory[0]!.time < cutoff) {
      velocityHistory.shift();
    }
  };

  const onPointerUp = (_e: PointerEvent) => {
    dragStart = null;
    flushPendingNow();
    if (motionAllowed() && velocityHistory.length > 0) {
      const totalPx = velocityHistory.reduce((s, h) => s + h.deltaPx, 0);
      const oldest = velocityHistory[0]!.time;
      const span = performance.now() - oldest || 1;
      const velocity = totalPx / span;
      if (Math.abs(velocity) >= INERTIA_VELOCITY_MIN) {
        startInertia(velocity);
      }
    }
    velocityHistory = [];
  };

  const onClick = () => {
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
    closeLocalePicker();
  };

  let wheelVelocityHistory: { time: number; deltaPx: number }[] = [];
  let wheelIdleTimer: ReturnType<typeof setTimeout> | null = null;
  const cancelWheelIdle = () => {
    if (wheelIdleTimer !== null) {
      clearTimeout(wheelIdleTimer);
      wheelIdleTimer = null;
    }
  };

  /** 各 wheel event の回転を ease-out tween で連続加算。連射時は前 tween 途中値から新目標へ追従。 */
  let wheelTweenTarget: number | null = null;
  let wheelTweenStartTime = 0;
  let wheelTweenStartLength = 0;
  let wheelTweenRaf: number | null = null;
  const cancelWheelTween = () => {
    if (wheelTweenRaf !== null) {
      cancelAnimationFrame(wheelTweenRaf);
      wheelTweenRaf = null;
    }
    wheelTweenTarget = null;
  };
  /** tween 進行中の未消化回転は、慣性開始や drag 開始時に位置を乖離させるので終端まで瞬時 jump で
   *  整合を取る。 */
  const flushWheelTweenToTarget = () => {
    if (wheelTweenTarget !== null) {
      rotateLocalePicker(wheelTweenTarget - localePickerLengthOffset());
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
    const targetL = wheelTweenStartLength + (wheelTweenTarget - wheelTweenStartLength) * eased;
    rotateLocalePicker(targetL - localePickerLengthOffset());
    if (t >= 1) {
      wheelTweenTarget = null;
      wheelTweenRaf = null;
      return;
    }
    wheelTweenRaf = requestAnimationFrame(tickWheelTween);
  };

  const onWheel = (e: WheelEvent) => {
    e.preventDefault();
    cancelInertia();
    const sign = e.deltaY > 0 ? 1 : -1;
    const deltaPx = sign * Math.abs(e.deltaY) * WHEEL_LENGTH_PER_DELTA;

    const baseTarget = wheelTweenTarget ?? localePickerLengthOffset();
    wheelTweenTarget = baseTarget + deltaPx;
    wheelTweenStartTime = performance.now();
    wheelTweenStartLength = localePickerLengthOffset();
    if (wheelTweenRaf === null) {
      wheelTweenRaf = requestAnimationFrame(tickWheelTween);
    }

    const now = performance.now();
    wheelVelocityHistory.push({ time: now, deltaPx });
    const cutoff = now - VELOCITY_WINDOW_MS;
    while (wheelVelocityHistory.length > 0 && wheelVelocityHistory[0]!.time < cutoff) {
      wheelVelocityHistory.shift();
    }

    cancelWheelIdle();
    if (!motionAllowed()) return;
    wheelIdleTimer = setTimeout(() => {
      wheelIdleTimer = null;
      if (wheelVelocityHistory.length === 0) return;
      const totalPx = wheelVelocityHistory.reduce((s, h) => s + h.deltaPx, 0);
      const oldest = wheelVelocityHistory[0]!.time;
      wheelVelocityHistory = [];
      if (Math.abs(totalPx) < WHEEL_INERTIA_MIN_TOTAL_PX) return;
      const span = performance.now() - oldest || 1;
      const velocity = totalPx / span;
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
      <For each={orderedLocales}>
        {(loc, i) => (
          <LocaleIcon
            origin={props.origin}
            locale={loc}
            index={i()}
            currentLocaleIndex={currentLocaleIndex}
            totalCount={orderedLocales.length}
            iconSize={iconSize()}
            iconFont={iconFont()}
            measurePath={measurePath}
            totalLength={totalLength}
            ringCx={ringCx}
            ringCy={ringCy}
            ringW={ringW}
            ringH={ringH}
            viewportWidth={viewport.width}
            viewportHeight={viewport.height}
          />
        )}
      </For>
    </div>
  );
};

const LocaleIcon: Component<{
  origin: LocalePickerOrigin;
  locale: LocaleMeta;
  index: number;
  currentLocaleIndex: number;
  totalCount: number;
  iconSize: number;
  iconFont: number;
  measurePath: () => SVGPathElement;
  totalLength: () => number;
  ringCx: () => number;
  ringCy: () => number;
  ringW: () => number;
  ringH: () => number;
  viewportWidth: () => number;
  viewportHeight: () => number;
}> = (props) => {
  let buttonRef: HTMLButtonElement | undefined;

  /** path-local 座標 (0,0)-(W,H) の中心 (W/2, H/2) を ring center に揃えて viewport 座標に変換。 */
  const position = createMemo(() => {
    const L = props.totalLength();
    if (L === 0) return null;
    const offset = localePickerLengthOffset();
    const len = ((props.index * L / props.totalCount + offset) % L + L) % L;
    const p = props.measurePath().getPointAtLength(len);
    return {
      x: props.ringCx() + (p.x - props.ringW() / 2),
      y: props.ringCy() + (p.y - props.ringH() / 2),
    };
  });

  /** 画面端で半切れ render を避けるため、icon size ぶんの margin を取って完全に画面外になるまで
   *  非表示にする (半 → 全 fade ではなく on/off)。 */
  const visible = createMemo(() => {
    const p = position();
    if (!p) return false;
    const margin = props.iconSize;
    const W = props.viewportWidth();
    const H = props.viewportHeight();
    return p.x >= -margin && p.x <= W + margin && p.y >= -margin && p.y <= H + margin;
  });

  /** 初回 mount 時に visible なものだけ stagger で出現アニメを起動。drag で後から visible に
   *  なった icon は無アニメで pop-in する (毎回鳴らすとリングが「光のループ」みたいに点滅して
   *  目障り)。stagger 起点は現在 locale より CURRENT_STAGGER_PRECEDING 個 CCW 側、進行は CW で
   *  ユーザ視点の「右回り」と一致する。 */
  onMount(() => {
    if (!buttonRef) return;
    if (!visible()) return;
    const baseIdx = props.currentLocaleIndex >= 0 ? props.currentLocaleIndex : 0;
    const startIdx = (baseIdx - CURRENT_STAGGER_PRECEDING + props.totalCount) % props.totalCount;
    const distance = (props.index - startIdx + props.totalCount) % props.totalCount;
    animateMotion(
      buttonRef,
      [
        {
          transform: "translate(-50%, -50%) scale(0)",
          opacity: 0,
          left: `${props.origin.x}px`,
          top: `${props.origin.y}px`,
        },
        {
          transform: "translate(-50%, -50%) scale(1)",
          opacity: 1,
        },
      ],
      {
        duration: APPEAR_DURATION_MS,
        delay: distance * STAGGER_MS,
        easing: "cubic-bezier(.34,1.56,.64,1)",
        fill: "backwards",
      },
    );
  });

  const onClick = (e: MouseEvent) => {
    e.stopPropagation();
    closeLocalePicker();
    switchLocaleByReload(props.locale.code);
  };

  return (
    <button
      ref={buttonRef}
      class="fixed rounded-full bg-white shadow-lg flex items-center justify-center before:hidden"
      style={{
        display: visible() ? "flex" : "none",
        left: `${position()?.x ?? props.origin.x}px`,
        top: `${position()?.y ?? props.origin.y}px`,
        width: `${props.iconSize}px`,
        height: `${props.iconSize}px`,
        "font-size": `${props.iconFont}px`,
        "line-height": "1",
        transform: "translate(-50%, -50%)",
        "will-change": "left, top",
      }}
      onClick={onClick}
      aria-label={props.locale.endonym}
    >
      {LOCALE_FLAG[props.locale.code] ?? props.locale.code}
    </button>
  );
};

export default LocalePicker;
