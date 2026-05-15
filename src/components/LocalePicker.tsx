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
 * 言語選択用リングメニュー。SchedulePicker の円形 ring を「角丸四角形 ring」に置き換えた版で、
 * trigger ボタン (= 左上の国旗ボタン) を中心に角丸四角の周囲に SUPPORTED_LOCALES (現在 20) を
 * 等間隔配置する。drag / wheel で path 上の length offset を進めるとアイテムが角丸四角の周りを
 * 自転車のチェーンのように回る。可視範囲は viewport 内に入った position のみ (= origin が画面
 * 左上にあるので ring の右下 quadrant が visible)。
 *
 * Landscape は ring を横長、Portrait は縦長にして viewport 縦横比に合わせる。SchedulePicker と
 * 同じ chronostasis 配下で動くため、open 中は時計の動的副作用が全停止 (App.tsx 側)。
 *
 * For は SUPPORTED_LOCALES (固定配列) を each に渡して全 N 個を 1 度だけ mount する。位置は各 Icon の
 * createMemo が path 上の point を毎フレーム再計算して left/top に書き戻す。可視範囲外は display:none
 * で paint をスキップ (unmount しないので drag 中も identity 保持)。
 */

const ICON_SIZE_MOBILE = 52;
const ICON_SIZE_TABLET = 72;
const ICON_FONT_MOBILE = 30;
const ICON_FONT_TABLET = 42;
/** アイテム同士の隙間 (px)。アイコン端から次アイコン端までの path 上距離。 */
const ICON_GAP_MOBILE = 8;
const ICON_GAP_TABLET = 12;
/** ring 長辺 = 短辺 * これ。1.0 だと正方形、1.5 で「角丸の細長い stadium 形」。 */
const RING_LONG_RATIO = 1.5;
/** 角丸 = ring 短辺 * これ。0.5 で短辺方向は完全な半円 = stadium / pill 形になり、
 *  長辺方向のみ直線を残す。自転車のチェーンっぽい滑らかな曲線で回転する。 */
const CORNER_RATIO = 0.5;
/** ring center を origin (= トリガーボタン位置) から押し出す距離 (ring 長辺 * これ)。
 *  push 方向は viewport 向きと一致した長辺軸: portrait なら上方向 (-y)、landscape なら左方向 (-x)。
 *  これで visible 範囲は viewport の長辺と直交する短い帯になり、current locale が画面の長辺中央
 *  に近い位置 (画面の上寄り or 左寄り) に来る。値を大きくするほど ring が更に画面外に押し出され
 *  visible 範囲が狭くなる。 */
const RING_CENTER_OUTSET_RATIO = 0.15;
/** stadium 形 (CORNER_RATIO = 0.5) の周長公式: perimeter = short * (2 * longRatio + π - 2)。
 *  ring 短辺をこの divisor で割って item 間隔 * N から逆算する。 */
const RING_PERIMETER_DIVISOR = 2 * RING_LONG_RATIO + Math.PI - 2;

const STAGGER_MS = 30;
const APPEAR_DURATION_MS = 280;
/** 現在 locale より前 (= path 上で CCW 側) に確保する近隣 locale 数。SUPPORTED_LOCALES の
 *  自然順だと先頭付近の locale (en, ja, es...) で開いた時に「自分より前」がほぼ無く、CW 一方向
 *  stagger で path 上の手前側がスカスカになる。配列を末尾から先頭に rotate して必要数を確保する。 */
const REQUIRED_LEFT_NEIGHBORS = 5;
/** 現在 locale が stagger で出る順番の手前 (= 現在より前に出る locale 数)。4 にすると現在 locale
 *  が 5 番目に出る。0 だと現在 locale が真っ先に出てしまい、ユーザは「自分はわかってるから先に
 *  周りの locale を見たい」感がない。 */
const CURRENT_STAGGER_PRECEDING = 4;

/** drag 閾値 (SchedulePicker と同じ感覚)。 */
const DRAG_THRESHOLD_FAST_PX = 2;
const DRAG_THRESHOLD_SLOW_PX = 6;
const DRAG_FAST_WINDOW_MS = 80;

/** wheel deltaY 1 単位 → length px。SchedulePicker は deg だがこちらは length 直接。 */
const WHEEL_LENGTH_PER_DELTA = 1.0;
const WHEEL_TWEEN_DURATION_MS = 200;
const WHEEL_IDLE_TRIGGER_MS = 100;
/** 慣性発火に必要な「直近窓内の累積 length」(px)。1 ノッチ程度では発火させず、フリック級だけ。 */
const WHEEL_INERTIA_MIN_TOTAL_PX = 80;

const VELOCITY_WINDOW_MS = 80;
/** 慣性減衰率 (exp 減衰 / ms)。SchedulePicker と同じ値。 */
const INERTIA_DECAY_PER_MS = 0.003;
/** 慣性停止閾値 (px/ms)。 */
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

  /** ring 寸法。item 間隔 (icon size + gap) * N が周長になるよう短辺を逆算するので、gap を変えれば
   *  ring も自動で伸び縮みする。viewport の向きに追従して長辺/短辺を決める。 */
  const itemSpacing = () => iconSize() + (isTablet() ? ICON_GAP_TABLET : ICON_GAP_MOBILE);
  const ringShort = () => SUPPORTED_LOCALES.length * itemSpacing() / RING_PERIMETER_DIVISOR;
  const ringLong = () => ringShort() * RING_LONG_RATIO;
  const ringW = () => isLandscape() ? ringLong() : ringShort();
  const ringH = () => isLandscape() ? ringShort() : ringLong();
  const cornerR = () => ringShort() * CORNER_RATIO;

  /** ring center 位置 (viewport 座標)。origin から viewport の長辺方向 (landscape=横 -x、portrait=縦
   *  -y) に push して ring を画面外に押し出す。push 量は ring の長辺 * RATIO。位置参照する側は
   *  この値を使うこと (origin は出現アニメ起点として別に保持)。 */
  const outsetPx = () => ringLong() * RING_CENTER_OUTSET_RATIO;
  const ringCx = () => isLandscape() ? props.origin.x - outsetPx() : props.origin.x;
  const ringCy = () => isLandscape() ? props.origin.y : props.origin.y - outsetPx();

  /** SVG path d 文字列 (CW 順、左上 corner 角丸の終点 = (R, 0) から開始)。path-local 座標は
   *  (0, 0) - (ringW, ringH)。viewport 座標への変換は origin - (ringW/2, ringH/2) を加える。 */
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

  /** 計測専用 path 要素を detached SVG namespace で生成。Solid の <path> ref を width=0 SVG 内に
   *  置くと Chromium で getTotalLength = 0 になる既知挙動があるため、DOM mount しない detached path
   *  を使う (geometry 計算は d 属性のみ依存)。 */
  const measurePath = createMemo(() => {
    const NS = "http://www.w3.org/2000/svg";
    const el = document.createElementNS(NS, "path") as SVGPathElement;
    el.setAttribute("d", pathD());
    return el;
  });

  const totalLength = createMemo(() => measurePath().getTotalLength());

  /** SUPPORTED_LOCALES における現在 locale の index。 */
  const rawCurrentIndex = SUPPORTED_LOCALES.findIndex(l => l.code === locale().code);

  /** 現在 locale より前に REQUIRED_LEFT_NEIGHBORS 個の近隣を確保するため、必要なら配列末尾を
   *  先頭に rotate した順序を作る。en (idx 0) なら末尾 5 個 (id, bn, hi, ur, fa) が先頭に来て、
   *  en は新 idx 5 になる。これにより stagger と path 配置が「現在 locale を中央」に揃う。 */
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

  /** rotate 後の配列における現在 locale の index。stagger 起点と initial offset の両方で使う。 */
  const currentLocaleIndex = rawCurrentIndex < 0
    ? -1
    : orderedLocales.findIndex(l => l.code === locale().code);

  /** 開いた瞬間に「現在 locale」が画面内 visible 範囲の中央に来るよう length offset を初期化。
   *  setup phase (= 子 LocaleIcon の onMount より前) で set するので、子の出現アニメ起動時には
   *  position が確定済み = end keyframe が正しい位置で固定される。L * 0.5 = path 半周 = 開始
   *  (上辺左) の対角 ≈ 右下 corner で、ring center が画面外左上にある今の配置では visible 中央。 */
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

  /** rAF 間引き用 (SchedulePicker と同型)。 */
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

  /** pointer の displacement を path 進行方向 length に変換。ring 中心から pointer までの
   *  ベクトル v = (vx, vy) の CCW 接線方向 (-vy, vx) / |v| に displacement を投影する。
   *  CCW を選ぶ理由は「pointer の動く方向にアイテムが追従する (= chain conveyor で指を引っ張った
   *  方向にチェーンが流れる)」直感に揃えるため。CW 接線にすると見た目逆に動く。 */
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
  /** 現在 locale の index。stagger 起点として使う (-1 で見つからない時は 0 起点に fallback)。 */
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

  /** path 上の (x, y) を viewport 座標へ変換。path-local 座標 (0,0)-(W,H) の中心 (W/2, H/2) が
   *  ring center (= 画面外左上) と一致するように offset 加算。 */
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

  /** viewport 内 (icon size ぶんの margin 込み) なら true。画面端で半切れ render を避けるため、
   *  完全に画面外になるまで非表示 (半 → 全 fade ではなく on/off)。 */
  const visible = createMemo(() => {
    const p = position();
    if (!p) return false;
    const margin = props.iconSize;
    const W = props.viewportWidth();
    const H = props.viewportHeight();
    return p.x >= -margin && p.x <= W + margin && p.y >= -margin && p.y <= H + margin;
  });

  /** 初回 mount 時に visible なものだけ stagger で出現アニメ。drag で後から visible に変わった
   *  icon は無アニメで pop-in (出現アニメを毎回鳴らすとリングが「光のループ」みたいに点滅して
   *  目障り)。stagger 起点は「現在 locale より CURRENT_STAGGER_PRECEDING 個 CCW 側」、進行方向は
   *  CW (path length 増加 = 配列上で後方) でユーザ視点の「右回り」。これで現在 locale は stagger
   *  順序で 3 番目あたりに登場する。 */
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
        // visible でない時は display:none で paint をスキップ。mount は維持されるので drag 中も
        // ref/state を失わない。
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
