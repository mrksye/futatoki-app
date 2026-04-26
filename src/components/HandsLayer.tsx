import { createEffect, type Accessor, type Component } from "solid-js";
import { detailMode } from "../features/settings/detail-mode";

/**
 * 時計の針 (時針・分針・中心ネジ) を描画するレイヤー。
 *
 * AnalogClock や ScheduleLayer とは独立した SVG として、AnalogClock を包む div の中に
 * 絶対配置で重ねる。レイヤースタックでは ScheduleLayer の上に乗せて、予定アイコンの
 * 上から針が指す形にする。
 *
 * (「分離できるものは常に分離する」原則: 針を別レイヤーにしておくと、その上下に
 *  どんな描画が来ても z 順を簡単に制御できる)
 *
 * 同じ viewBox (340x340) を使うので、AnalogClock の盤面と座標系が完全に一致する。
 *
 * Props:
 *   - hours, minutes: 表示する時刻 (時針角度は分も加味して滑らかに進める)
 *   - shakeKey?: 「逆回転を試みた」イベントの incrementing counter (resistance.ts)。
 *     値が増えるたびに minute hand (= 長針) を Web Animations API で短時間 wobble。
 *     hour hand (= 短針) と中心ネジは shake しない (「抵抗するのは長針のみ」)。
 *     連射時は新しい animate() が直前の animation を上書きする = 都度フレッシュに発火。
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

  // shakeKey の値変化で minute hand wrapper に Web Animations API で wobble。
  // 内側 <g> は SVG transform で固有角度に rotate しているのでそちらは触らず、
  // 外側 wrapper <g> の CSS transform を独立に動かして compose させる。
  // SVG <g> の CSS transform-origin は transform-box: view-box を効かせて
  // viewBox 中央 (= clock 中心) で pivot させる。
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
        {/* 時針
            白縁取りは黒と同じ line 端点で描くことで stroke 幅の差ぶんだけが outline になり、
            側面/先端/根元の padding が全周で均一 ((white_stroke - black_stroke) / 2 = 1.5) になる。 */}
        <g
          transform={`rotate(${hourAngle() + 90} ${CENTER} ${CENTER})`}
          style="will-change: transform"
        >
          <line x1={CENTER} y1={CENTER + 10} x2={CENTER} y2={CENTER - R() * 0.48}
            stroke="#ffffff" stroke-width="10" stroke-linecap="round" />
          <line x1={CENTER} y1={CENTER + 10} x2={CENTER} y2={CENTER - R() * 0.48}
            stroke="#111111" stroke-width="7" stroke-linecap="round" />
        </g>

        {/* 分針 (時針と同じ思想: 白と黒で同じ line 端点、padding 全周均一 = 1.25)。
            shake 用の外側 wrapper <g> で囲んで、内側 <g> の rotation と独立に
            CSS transform を当てられるようにしてある。 */}
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
