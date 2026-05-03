import { createEffect, onCleanup, type Accessor, type Component } from "solid-js";
import { detailMode } from "../features/settings/detail-mode";
import { colorMode } from "../features/settings/color-mode";
import { paletteId } from "../features/settings/palette";

/**
 * 時計の針 (時針・分針・中心ネジ) を描画するレイヤー。ClockFace を包む div の中に絶対配置で重ね、
 * ScheduleLayer の上に乗せて予定アイコンの上から針が指す形にする (z 順を独立に制御するため別レイヤー)。
 *
 * shakeKey は「逆回転を試みた」イベントの incrementing counter (resistance.ts)。値が増えるたびに
 * minute hand を WAAPI で短時間 wobble させる (= hour hand と中心ネジは shake しない / 抵抗するのは
 * 長針のみ)。連射時は前回 Animation を明示 cancel してから新規 animate を発火させる
 * (cancel しない場合、unmount 後も Animation が element ref を保持して detached node が retain される)。
 *
 * minuteTickKey は「実時刻の分が切り替わった」イベントの incrementing counter (ClockLayout)。値が
 * 増えるたびに minute hand を進行方向にごく軽くオーバーシュートさせて減衰振動 (ビィィーンッ) を出す。
 * shake と同じ wrapper を共有するが、各 effect が独立した Animation ref を持って互いに干渉しないよう
 * 個別 cancel する。onCleanup で両方明示 cancel して unmount 時にメモリ解放を確実にする。
 */

interface HandsLayerProps {
  hours: number;
  minutes: number;
  shakeKey?: Accessor<number>;
  minuteTickKey?: Accessor<number>;
}

const VIEW = 340;
const CENTER = VIEW / 2;

const SHAKE_KEYFRAMES: Keyframe[] = [
  { transform: "rotate(0deg)" },
  { transform: "rotate(-3.5deg)", offset: 0.18 },
  { transform: "rotate(2.5deg)",  offset: 0.36 },
  { transform: "rotate(-1.5deg)", offset: 0.56 },
  { transform: "rotate(0.6deg)",  offset: 0.78 },
  { transform: "rotate(0deg)" },
];
const SHAKE_TIMING: KeyframeAnimationOptions = {
  duration: 320,
  easing: "cubic-bezier(.36, .07, .19, .97)",
};

/** 分が進んだ瞬間の軽 wobble。進行方向 (時計回り = +deg) にひと押しオーバーシュートしてから
 *  振幅を急減衰させ「ビィィーンッ」と止まる。shake より小振幅 (max 1.6deg) でユーザに気付かれない
 *  くらい軽い演出を狙う。 */
const MINUTE_TICK_KEYFRAMES: Keyframe[] = [
  { transform: "rotate(0deg)" },
  { transform: "rotate(1.6deg)",  offset: 0.22 },
  { transform: "rotate(-0.7deg)", offset: 0.44 },
  { transform: "rotate(0.3deg)",  offset: 0.64 },
  { transform: "rotate(-0.1deg)", offset: 0.82 },
  { transform: "rotate(0deg)" },
];
const MINUTE_TICK_TIMING: KeyframeAnimationOptions = {
  duration: 380,
  easing: "ease-out",
};

/**
 * 針長 factor (R との比) を detailMode × colorMode の 4 通りで個別に持つ。
 * くわしく/すっきり (R が 130 / 148) と くぎり/ばっじ (数字外端の幾何が違う) で
 * 「針 tip と数字/badge 内端の距離」が揃わないので、4 mode 個別に微調整する。Kawaii 担保用。
 */
type ModeKey = "kuwashiku-sector" | "kuwashiku-badge" | "sukkiri-sector" | "sukkiri-badge";
const HAND_FACTORS: Record<ModeKey, { hour: number; minute: number }> = {
  "kuwashiku-sector": { hour: 0.49, minute: 0.79 },
  "kuwashiku-badge":  { hour: 0.46, minute: 0.75 },
  "sukkiri-sector":   { hour: 0.48, minute: 0.78 },
  "sukkiri-badge":    { hour: 0.45, minute: 0.73 },
};

/** monotone × badge は「文字盤自体がバッジ化」する特別仕様。
 *  - 長針: 円盤縁の minute tick 内端ギリギリ。
 *  - 短針: cardinal 数字の inner edge に round linecap (stroke radius 5) がちょうど触れる位置。
 *    PM 24h の "15"/"21" を含む最も内側に来る "3"/"9" 位置の inner edge を基準に決める。
 *  通常モードの hour:minute 比 (~0.61) にも自然に揃う。 */
const MONOTONE_BADGE_FACTORS: Record<"kuwashiku" | "sukkiri", { hour: number; minute: number }> = {
  "kuwashiku": { hour: 0.58, minute: 0.94 },
  "sukkiri":   { hour: 0.60, minute: 0.95 },
};

const HandsLayer: Component<HandsLayerProps> = (props) => {
  const isKuwashiku = () => detailMode() === "kuwashiku";
  const R = () => isKuwashiku() ? 130 : 148;
  const factors = () => {
    if (colorMode() === "badge" && paletteId() === "monotone") {
      return MONOTONE_BADGE_FACTORS[detailMode()];
    }
    return HAND_FACTORS[`${detailMode()}-${colorMode()}` as ModeKey];
  };

  const hourAngle = () => {
    const h = props.hours % 12;
    return (h + props.minutes / 60) * 30 - 90;
  };
  const minuteAngle = () => props.minutes * 6 - 90;

  /** shake 発動用の外側 wrapper ref。内側 <g> は SVG transform で角度を持つので、それと compose
   *  させるため別レイヤーに分ける。transform-box: view-box で viewBox 中央 (= clock 中心) を pivot に。 */
  let minuteHandWrapperRef: SVGGElement | undefined;
  let shakeAnim: Animation | null = null;
  let minuteTickAnim: Animation | null = null;
  createEffect(() => {
    const key = props.shakeKey?.() ?? 0;
    if (key === 0 || !minuteHandWrapperRef) return; // 初期 mount 時は発火しない
    shakeAnim?.cancel();
    shakeAnim = minuteHandWrapperRef.animate(SHAKE_KEYFRAMES, SHAKE_TIMING);
  });
  createEffect(() => {
    const key = props.minuteTickKey?.() ?? 0;
    if (key === 0 || !minuteHandWrapperRef) return;
    minuteTickAnim?.cancel();
    minuteTickAnim = minuteHandWrapperRef.animate(MINUTE_TICK_KEYFRAMES, MINUTE_TICK_TIMING);
  });
  onCleanup(() => {
    shakeAnim?.cancel();
    minuteTickAnim?.cancel();
  });

  return (
    <div class="absolute inset-0 flex items-center justify-center pointer-events-none">
      <svg
        viewBox={`0 0 ${VIEW} ${VIEW}`}
        class="w-full h-full"
        style="max-height: 100%; max-width: 100%;"
      >
        {/* 時針: 白と黒で同じ line 端点を引くことで stroke 幅の差ぶんだけが outline になる
            (側面/先端/根元の padding 全周均一 = (10-7)/2 = 1.5)。 */}
        <g
          transform={`rotate(${hourAngle() + 90} ${CENTER} ${CENTER})`}
          style="will-change: transform"
        >
          <line x1={CENTER} y1={CENTER + 10} x2={CENTER} y2={CENTER - R() * factors().hour}
            stroke="#ffffff" stroke-width="10" stroke-linecap="round" />
          <line x1={CENTER} y1={CENTER + 10} x2={CENTER} y2={CENTER - R() * factors().hour}
            stroke="#111111" stroke-width="7" stroke-linecap="round" />
        </g>

        {/* 分針 (同じ outline 思想で padding 1.25)。shake 用の外側 wrapper <g> で囲む。 */}
        <g
          ref={minuteHandWrapperRef}
          style={{ "transform-box": "view-box", "transform-origin": "50% 50%" }}
        >
          <g
            transform={`rotate(${minuteAngle() + 90} ${CENTER} ${CENTER})`}
            style="will-change: transform"
          >
            <line x1={CENTER} y1={CENTER + 13} x2={CENTER} y2={CENTER - R() * factors().minute}
              stroke="#ffffff" stroke-width="6" stroke-linecap="round" />
            <line x1={CENTER} y1={CENTER + 13} x2={CENTER} y2={CENTER - R() * factors().minute}
              stroke="#111111" stroke-width="3.5" stroke-linecap="round" />
          </g>
        </g>

        {/* 中心ネジ */}
        <circle cx={CENTER} cy={CENTER} r="7" fill="white" />
        <circle cx={CENTER} cy={CENTER} r="5" fill="#111111" />
        <circle cx={CENTER} cy={CENTER} r="2" fill="white" />
      </svg>
    </div>
  );
};

export default HandsLayer;
