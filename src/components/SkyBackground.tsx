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

      {/* 太陽 */}
      <Show when={sun().visible}>
        <div
          class="absolute"
          style={{
            left: `${sun().xPct}%`,
            top: `${sun().yPct}%`,
            transform: "translate(-50%, -50%)",
            width: "72px",
            height: "72px",
            "border-radius": "50%",
            background: "radial-gradient(circle, #fffae0 0%, #ffd860 55%, #ff9828 100%)",
            "box-shadow": "0 0 50px #ffe090, 0 0 100px #ffc060cc",
          }}
        />
      </Show>

      {/* 月 */}
      <Show when={moon().visible}>
        <div
          class="absolute"
          style={{
            left: `${moon().xPct}%`,
            top: `${moon().yPct}%`,
            transform: "translate(-50%, -50%)",
            width: "56px",
            height: "56px",
            "border-radius": "50%",
            background: "radial-gradient(circle at 35% 35%, #fffdf0 0%, #f0f0d8 50%, #c8c8a8 100%)",
            "box-shadow": "0 0 30px #fff8c880, 0 0 60px #e8e0b060",
          }}
        />
      </Show>
    </div>
  );
};

export default SkyBackground;
