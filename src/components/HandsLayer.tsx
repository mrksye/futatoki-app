import { createEffect, type Accessor, type Component } from "solid-js";
import { detailMode } from "../features/settings/detail-mode";

/**
 * 時計の針 (時針・分針・中心ネジ) を描画するレイヤー。ClockFace を包む div の中に絶対配置で重ね、
 * ScheduleLayer の上に乗せて予定アイコンの上から針が指す形にする (z 順を独立に制御するため別レイヤー)。
 *
 * shakeKey は「逆回転を試みた」イベントの incrementing counter (resistance.ts)。値が増えるたびに
 * minute hand を WAAPI で短時間 wobble させる (= hour hand と中心ネジは shake しない / 抵抗するのは
 * 長針のみ)。連射時は新しい animate() が直前の animation を上書きするので毎回フレッシュに発火する。
 */

interface HandsLayerProps {
  hours: number;
  minutes: number;
  shakeKey?: Accessor<number>;
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

const HandsLayer: Component<HandsLayerProps> = (props) => {
  const isKuwashiku = () => detailMode() === "kuwashiku";
  const R = () => isKuwashiku() ? 130 : 148;

  const hourAngle = () => {
    const h = props.hours % 12;
    return (h + props.minutes / 60) * 30 - 90;
  };
  const minuteAngle = () => props.minutes * 6 - 90;

  // shake は外側 wrapper <g> の CSS transform で発動。内側 <g> は SVG transform で角度を持つので、
  // そちらと compose させるため別レイヤーに分けてある。transform-box: view-box で viewBox 中央
  // (= clock 中心) を pivot にする。
  let minuteHandWrapperRef: SVGGElement | undefined;
  createEffect(() => {
    const key = props.shakeKey?.() ?? 0;
    if (key === 0 || !minuteHandWrapperRef) return; // 初期 mount 時は発火しない
    minuteHandWrapperRef.animate(SHAKE_KEYFRAMES, SHAKE_TIMING);
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
          <line x1={CENTER} y1={CENTER + 10} x2={CENTER} y2={CENTER - R() * 0.48}
            stroke="#ffffff" stroke-width="10" stroke-linecap="round" />
          <line x1={CENTER} y1={CENTER + 10} x2={CENTER} y2={CENTER - R() * 0.48}
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
            <line x1={CENTER} y1={CENTER + 13} x2={CENTER} y2={CENTER - R() * 0.76}
              stroke="#ffffff" stroke-width="6" stroke-linecap="round" />
            <line x1={CENTER} y1={CENTER + 13} x2={CENTER} y2={CENTER - R() * 0.76}
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
