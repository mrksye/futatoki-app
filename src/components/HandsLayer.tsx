import type { Component } from "solid-js";
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
 */

interface HandsLayerProps {
  hours: number;
  minutes: number;
}

const VIEW = 340;
const CENTER = VIEW / 2;

const HandsLayer: Component<HandsLayerProps> = (props) => {
  const isKuwashiku = () => detailMode() === "kuwashiku";
  const R = () => isKuwashiku() ? 130 : 148;

  const hourAngle = () => {
    const h = props.hours % 12;
    return (h + props.minutes / 60) * 30 - 90;
  };
  const minuteAngle = () => props.minutes * 6 - 90;

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

        {/* 分針 (時針と同じ思想: 白と黒で同じ line 端点、padding 全周均一 = 1.25) */}
        <g
          transform={`rotate(${minuteAngle() + 90} ${CENTER} ${CENTER})`}
          style="will-change: transform"
        >
          <line x1={CENTER} y1={CENTER + 13} x2={CENTER} y2={CENTER - R() * 0.76}
            stroke="#ffffff" stroke-width="6" stroke-linecap="round" />
          <line x1={CENTER} y1={CENTER + 13} x2={CENTER} y2={CENTER - R() * 0.76}
            stroke="#111111" stroke-width="3.5" stroke-linecap="round" />
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
