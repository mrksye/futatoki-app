import { createEffect, onCleanup, Show, type Accessor, type Component } from "solid-js";
import { clockMode } from "../../features/free-rotation/state";
import { clockRadius, handFactors } from "./geometry";

/**
 * 時計の針 (時針・分針・中心ネジ) を描画するレイヤー。ClockFace を包む div の中に絶対配置で重ね、
 * ActivityLayer の上に乗せてできごとアイコンの上から針が指す形にする (z 順を独立に制御するため別レイヤー)。
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
 *
 * autoRotate 中は root に `.print-hands-hidden` が付き、印刷時に SVG 直下の <g> (時針 / 分針) が消える。
 * 中心ネジの <circle> は <g> 外なので残り、書き込み学習帳 (盤面 + ネジを見て針を書き込む) として刷れる。
 */

/** 分針 (長針) 本体の見た目 (色 + 不透明度)。色と濃さは「どう見せるか」として一体なので 1 つの値にまとめる。
 *  白い縁取りは常に不透明のまま残るのでこれは黒本体ぶんだけに効き、timer の現在針 (grey ghost / 薄青) の
 *  状態差を 1 つの値で渡せる。中身を決めるのは features/timer/timer-hand-style 側で、ここは型だけ持つ。 */
export interface MinuteHandStyle {
  color: string;
  opacity: number;
}

interface HandsLayerProps {
  hours: number;
  minutes: number;
  shakeKey?: Accessor<number>;
  minuteTickKey?: Accessor<number>;
  /** 2 本目の分針 (マーカー) を描く位置 (分)。timer の終了マーカー針 (= タイマーの目標, 不透明の黒) に
   *  使う。primary 分針と同じ geometry を重ねるだけで、shake / tick の WAAPI animation は乗らない静的な針。
   *  時針マーカーは描かない (分タイマーなので短針は無視)。未指定なら描画しない。 */
  markerMinutes?: number;
  /** 分針 (長針) 本体の見た目 (色 + 不透明度)。timer の現在針はこれで grey ghost / 薄青を切り替える。
   *  未指定なら不透明の黒 = 通常の時計針。時針・中心ネジは常に不透明で影響を受けない。 */
  minuteHandStyle?: MinuteHandStyle;
  /** 3 本目の分針 (経過オーバーラン針) を描く位置 (分)。timer の done 状態で「終了時刻から今どれだけ
   *  過ぎてるか」を示すために、live 現在時刻に追従する長針として使う。marker (黒静止) と minute
   *  hand (grey ghost) の「裏」(= SVG 描画順で先) に置くため、JSX 上は時針の直後に描く。未指定なら描画しない。 */
  overrunMinutes?: number;
  /** overrunMinutes 針の見た目 (色 + 不透明度)。現在針 (grey ghost) と同じグレーに留め、過ぎた量は青い扇に
   *  語らせる思想。未指定なら不透明の黒。 */
  overrunStyle?: MinuteHandStyle;
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

const HandsLayer: Component<HandsLayerProps> = (props) => {
  // 針長は detailMode × colorMode で決まる (geometry.handFactors)。タイマー扇も同じ helper を共有する。
  const R = clockRadius;
  const factors = handFactors;

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
    <div
      class="absolute inset-0 flex items-center justify-center pointer-events-none"
      classList={{ "print-hands-hidden": clockMode() === "autoRotate" }}
    >
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

        {/* オーバーラン針 (timer の done で live 現在時刻に追従する経過表示)。minute hand と marker の
            「裏」に来るように SVG 描画順で先に置く。minute hand / marker と同じ「白 width6 → 本体 width3.5」の
            二枚重ねで白い縁取りを付ける (padding 1.25 で揃える)。opacity は本体だけに載せ、白い縁取りは不透明
            のまま残す (grey ghost でも輪郭はくっきり)。 */}
        <Show when={props.overrunMinutes !== undefined}>
          <g transform={`rotate(${(props.overrunMinutes ?? 0) * 6} ${CENTER} ${CENTER})`}>
            <line x1={CENTER} y1={CENTER + 13} x2={CENTER} y2={CENTER - R() * factors().minute}
              stroke="#ffffff" stroke-width="6" stroke-linecap="round" />
            <line x1={CENTER} y1={CENTER + 13} x2={CENTER} y2={CENTER - R() * factors().minute}
              stroke={props.overrunStyle?.color ?? "#111111"} stroke-width="3.5" stroke-linecap="round"
              opacity={props.overrunStyle?.opacity ?? 1} />
          </g>
        </Show>

        {/* 分針 (同じ outline 思想で padding 1.25)。shake 用の外側 wrapper <g> で囲む。
            opacity は黒い本体の line だけに載せ、白い縁取りは不透明のまま残す (timer の現在針ゴースト
            でも輪郭はくっきり)。時針・中心ネジは別 <g>/<circle> なので不変。 */}
        <g
          ref={minuteHandWrapperRef}
          style={{
            "transform-box": "view-box",
            "transform-origin": "50% 50%",
          }}
        >
          <g
            transform={`rotate(${minuteAngle() + 90} ${CENTER} ${CENTER})`}
            style="will-change: transform"
          >
            <line x1={CENTER} y1={CENTER + 13} x2={CENTER} y2={CENTER - R() * factors().minute}
              stroke="#ffffff" stroke-width="6" stroke-linecap="round" />
            <line x1={CENTER} y1={CENTER + 13} x2={CENTER} y2={CENTER - R() * factors().minute}
              stroke={props.minuteHandStyle?.color ?? "#111111"} stroke-width="3.5" stroke-linecap="round"
              opacity={props.minuteHandStyle?.opacity ?? 1} />
          </g>
        </g>

        {/* 2 本目の分針 (timer の終了マーカー = タイマーの目標)。primary と同 geometry を不透明の黒で
            重ねる静的な針。 */}
        <Show when={props.markerMinutes !== undefined}>
          <g transform={`rotate(${(props.markerMinutes ?? 0) * 6} ${CENTER} ${CENTER})`}>
            <line x1={CENTER} y1={CENTER + 13} x2={CENTER} y2={CENTER - R() * factors().minute}
              stroke="#ffffff" stroke-width="6" stroke-linecap="round" />
            <line x1={CENTER} y1={CENTER + 13} x2={CENTER} y2={CENTER - R() * factors().minute}
              stroke="#111111" stroke-width="3.5" stroke-linecap="round" />
          </g>
        </Show>

        {/* 中心ネジ */}
        <circle cx={CENTER} cy={CENTER} r="7" fill="white" />
        <circle cx={CENTER} cy={CENTER} r="5" fill="#111111" />
        <circle cx={CENTER} cy={CENTER} r="2" fill="white" />
      </svg>
    </div>
  );
};

export default HandsLayer;
