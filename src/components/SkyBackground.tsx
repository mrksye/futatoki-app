import { For, Show, createMemo } from "solid-js";
import type { Component } from "solid-js";

/**
 * 手回しモード時の空背景。時間帯に応じてグラデーション・太陽/月・星を描く。
 * 太陽は朝6時〜夕方18時、月は夕方18時〜朝6時に上空を弧状に移動する。
 */

interface SkyColor {
  top: string;
  bottom: string;
}

// 時間ごとの空の色（0-23時の上下2色グラデーション）
const skyPalette: SkyColor[] = [
  { top: "#050518", bottom: "#0A0A28" }, // 0 深夜
  { top: "#050518", bottom: "#0A0A28" }, // 1
  { top: "#080820", bottom: "#10102C" }, // 2
  { top: "#14143C", bottom: "#201850" }, // 3
  { top: "#2C2870", bottom: "#583890" }, // 4 夜明け前
  { top: "#583890", bottom: "#B04888" }, // 5 暁
  { top: "#B04888", bottom: "#F06048" }, // 6 朝焼け
  { top: "#F4A868", bottom: "#F8D098" }, // 7
  { top: "#88C8F0", bottom: "#F8D8A8" }, // 8 朝
  { top: "#58A8E8", bottom: "#B8DCF0" }, // 9
  { top: "#3090E0", bottom: "#B0D8F0" }, // 10
  { top: "#1080E0", bottom: "#A8D0E8" }, // 11
  { top: "#0878D8", bottom: "#A8D8F0" }, // 12 真昼
  { top: "#1080D8", bottom: "#A8D0E8" }, // 13
  { top: "#2888D8", bottom: "#A8C8E0" }, // 14
  { top: "#5098C0", bottom: "#B8B0C8" }, // 15
  { top: "#A08098", bottom: "#F0A868" }, // 16
  { top: "#E06030", bottom: "#F8A058" }, // 17 夕焼け
  { top: "#A83048", bottom: "#E06030" }, // 18
  { top: "#501878", bottom: "#A02858" }, // 19 黄昏
  { top: "#281858", bottom: "#481870" }, // 20
  { top: "#101838", bottom: "#201848" }, // 21
  { top: "#080820", bottom: "#141028" }, // 22
  { top: "#040418", bottom: "#0A0A24" }, // 23
];

function hexToRgb(hex: string): [number, number, number] {
  const v = parseInt(hex.slice(1), 16);
  return [(v >> 16) & 0xff, (v >> 8) & 0xff, v & 0xff];
}

function rgbToHex(r: number, g: number, b: number): string {
  const to = (v: number) => Math.round(v).toString(16).padStart(2, "0");
  return `#${to(r)}${to(g)}${to(b)}`;
}

function lerpColor(a: string, b: string, t: number): string {
  const [ar, ag, ab] = hexToRgb(a);
  const [br, bg, bb] = hexToRgb(b);
  return rgbToHex(ar + (br - ar) * t, ag + (bg - ag) * t, ab + (bb - ab) * t);
}

function skyAtMinute(totalMinutes: number): SkyColor {
  const hourFloat = totalMinutes / 60;
  const h0 = Math.floor(hourFloat) % 24;
  const h1 = (h0 + 1) % 24;
  const t = hourFloat - Math.floor(hourFloat);
  return {
    top: lerpColor(skyPalette[h0]!.top, skyPalette[h1]!.top, t),
    bottom: lerpColor(skyPalette[h0]!.bottom, skyPalette[h1]!.bottom, t),
  };
}

/** 太陽: 6時に東の地平、12時に天頂、18時に西の地平 */
function sunPosition(totalMinutes: number): { visible: boolean; xPct: number; yPct: number } {
  const progress = (totalMinutes - 360) / 720;
  if (progress < 0 || progress > 1) return { visible: false, xPct: 0, yPct: 0 };
  const xPct = progress * 100;
  // 上半分を弧で移動。y=50%が地平、y=5%が天頂。
  const arcHeight = 45; // %
  const yPct = 50 - Math.sin(progress * Math.PI) * arcHeight;
  return { visible: true, xPct, yPct };
}

/** 月: 18時に東、24時に天頂、6時に西 */
function moonPosition(totalMinutes: number): { visible: boolean; xPct: number; yPct: number } {
  const moonMin = (totalMinutes - 1080 + 1440) % 1440;
  const progress = moonMin / 720;
  if (progress < 0 || progress > 1) return { visible: false, xPct: 0, yPct: 0 };
  const xPct = progress * 100;
  const arcHeight = 40;
  const yPct = 50 - Math.sin(progress * Math.PI) * arcHeight;
  return { visible: true, xPct, yPct };
}

/** 夜の深さ: 太陽が地平下にいるほど強い。0〜1 */
function nightness(totalMinutes: number): number {
  // 20時〜4時 をピーク、18〜19時 / 5〜6時 でフェード
  const h = totalMinutes / 60;
  if (h >= 20 || h < 4) return 1;
  if (h >= 18 && h < 20) return (h - 18) / 2;
  if (h >= 4 && h < 6) return (6 - h) / 2;
  return 0;
}

// 一度だけ固定生成する星（乱数）
interface Star {
  xPct: number;
  yPct: number;
  r: number;
  delay: number;
}
const STARS: Star[] = Array.from({ length: 60 }, () => ({
  xPct: Math.random() * 100,
  yPct: Math.random() * 55, // 上半分中心
  r: 0.6 + Math.random() * 1.4,
  delay: Math.random() * 3,
}));

interface SkyBackgroundProps {
  /** 0-1439 の総分数 */
  totalMinutes: number;
}

const SkyBackground: Component<SkyBackgroundProps> = (props) => {
  const sky = createMemo(() => skyAtMinute(props.totalMinutes));
  const sun = createMemo(() => sunPosition(props.totalMinutes));
  const moon = createMemo(() => moonPosition(props.totalMinutes));
  const starOp = createMemo(() => Math.max(0, nightness(props.totalMinutes) - 0.3) * 1.4);

  return (
    <div
      class="absolute inset-0 overflow-hidden"
      style={{
        background: `linear-gradient(180deg, ${sky().top} 0%, ${sky().bottom} 100%)`,
      }}
    >
      {/* 星（夜のみ） */}
      <div
        class="absolute inset-0"
        style={{ opacity: starOp(), transition: "opacity 0.8s ease" }}
      >
        <For each={STARS}>
          {(s) => (
            <div
              class="absolute rounded-full bg-white"
              style={{
                left: `${s.xPct}%`,
                top: `${s.yPct}%`,
                width: `${s.r * 2}px`,
                height: `${s.r * 2}px`,
                animation: `twinkle 3s ease-in-out ${s.delay}s infinite`,
              }}
            />
          )}
        </For>
      </div>

      {/* 太陽（放射状の光線＋にっこり顔） */}
      <Show when={sun().visible}>
        <div
          class="absolute"
          style={{
            left: `${sun().xPct}%`,
            top: `${sun().yPct}%`,
            transform: "translate(-50%, -50%)",
            width: "120px",
            height: "120px",
            filter: "drop-shadow(0 0 24px #ffd06080)",
          }}
        >
          <svg viewBox="-60 -60 120 120" class="w-full h-full">
            {/* 光線（12本） */}
            <g stroke="#FFB020" stroke-width="4" stroke-linecap="round">
              <For each={Array.from({ length: 12 })}>
                {(_, i) => {
                  const ang = (i() * 30 * Math.PI) / 180;
                  const r1 = 34;
                  const r2 = 52;
                  return (
                    <line
                      x1={r1 * Math.cos(ang)}
                      y1={r1 * Math.sin(ang)}
                      x2={r2 * Math.cos(ang)}
                      y2={r2 * Math.sin(ang)}
                    />
                  );
                }}
              </For>
            </g>
            {/* 本体 */}
            <circle cx="0" cy="0" r="28" fill="#FFD848" stroke="#FFB020" stroke-width="2.5" />
            {/* ほっぺ */}
            <circle cx="-13" cy="6" r="4.5" fill="#FF9BB0" opacity="0.75" />
            <circle cx="13" cy="6" r="4.5" fill="#FF9BB0" opacity="0.75" />
            {/* 目 */}
            <circle cx="-8" cy="-4" r="2.2" fill="#3A2818" />
            <circle cx="8" cy="-4" r="2.2" fill="#3A2818" />
            {/* 口 */}
            <path d="M -6 6 Q 0 11 6 6" stroke="#3A2818" stroke-width="2" stroke-linecap="round" fill="none" />
          </svg>
        </div>
      </Show>

      {/* 月（三日月＋にっこり顔） */}
      <Show when={moon().visible}>
        <div
          class="absolute"
          style={{
            left: `${moon().xPct}%`,
            top: `${moon().yPct}%`,
            transform: "translate(-50%, -50%)",
            width: "84px",
            height: "84px",
            filter: "drop-shadow(0 0 16px #fff8c880)",
          }}
        >
          <svg viewBox="-42 -42 84 84" class="w-full h-full">
            <defs>
              {/* 満月から少し右上に欠けた円を差し引いて三日月にする */}
              <mask id="crescent-mask">
                <rect x="-42" y="-42" width="84" height="84" fill="black" />
                <circle cx="0" cy="0" r="32" fill="white" />
                <circle cx="14" cy="-8" r="28" fill="black" />
              </mask>
            </defs>
            {/* 月本体（三日月） */}
            <g mask="url(#crescent-mask)">
              <circle cx="0" cy="0" r="32" fill="#FFF5C8" />
              <circle cx="0" cy="0" r="32" fill="#FFE88A" opacity="0.5" />
            </g>
            {/* 輪郭（三日月の内外にほんのり） */}
            <g mask="url(#crescent-mask)">
              <circle cx="0" cy="0" r="31" fill="none" stroke="#E8C060" stroke-width="1.2" />
            </g>
            {/* 顔（三日月の左側の"太い部分"に配置） */}
            <circle cx="-14" cy="2" r="1.6" fill="#3A2818" />
            <circle cx="-5" cy="-1" r="1.6" fill="#3A2818" />
            <path d="M -14 7 Q -10 10 -6 7" stroke="#3A2818" stroke-width="1.3" stroke-linecap="round" fill="none" />
            {/* ほっぺ */}
            <circle cx="-18" cy="6" r="2.4" fill="#FFB0A0" opacity="0.6" />
          </svg>
        </div>
      </Show>
    </div>
  );
};

export default SkyBackground;
