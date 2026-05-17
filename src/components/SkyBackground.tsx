import { For, Show, createMemo } from "solid-js";
import type { Component } from "solid-js";
import { isFullMoonActive } from "../features/full-moon-easter-egg";

/**
 * 自由回転モード時の空背景。時間帯に応じてグラデーション・太陽/月・星を描く。
 * 太陽は朝 6 時〜夕方 18 時、月は夕方 18 時〜朝 6 時に上空を弧状に移動する。
 *
 * パフォーマンス指針:
 * - 位置は left/top でなく transform: translate (GPU composite のみ)
 * - drop-shadow / box-shadow は不使用 (毎フレーム GPU 再計算で重い)
 * - 背景グラデーションは 2 分刻みに量子化して repaint 頻度を抑える
 * - 星は常時アニメだが数を絞る
 *
 * 印刷時は root の `.sky-background` を白で塗り潰し、子要素 (太陽 / 月 / 星) を display:none する。
 * freeRotate / autoRotate でしか DOM に存在しないため「画面でこれが見えるとき = 紙が白」になり、
 * clock モード時は不在なので html/body/#root のベースグラデがそのまま紙に焼ける。
 */

interface SkyColor {
  top: string;
  bottom: string;
}

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

/** 太陽: 6 時に東の地平、12 時に天頂、18 時に西の地平。 */
function sunPosition(totalMinutes: number): { visible: boolean; xPct: number; yPct: number } {
  const progress = (totalMinutes - 360) / 720;
  if (progress < 0 || progress > 1) return { visible: false, xPct: 0, yPct: 0 };
  const xPct = progress * 100;
  const arcHeight = 45; // %
  const yPct = 50 - Math.sin(progress * Math.PI) * arcHeight;
  return { visible: true, xPct, yPct };
}

/** 月: 18 時に東、24 時に天頂、6 時に西。 */
function moonPosition(totalMinutes: number): { visible: boolean; xPct: number; yPct: number } {
  const moonMin = (totalMinutes - 1080 + 1440) % 1440;
  const progress = moonMin / 720;
  if (progress < 0 || progress > 1) return { visible: false, xPct: 0, yPct: 0 };
  const xPct = progress * 100;
  const arcHeight = 40;
  const yPct = 50 - Math.sin(progress * Math.PI) * arcHeight;
  return { visible: true, xPct, yPct };
}

function nightness(totalMinutes: number): number {
  const h = totalMinutes / 60;
  if (h >= 20 || h < 4) return 1;
  if (h >= 18 && h < 20) return (h - 18) / 2;
  if (h >= 4 && h < 6) return (6 - h) / 2;
  return 0;
}

interface Star {
  xPct: number;
  yPct: number;
  r: number;
  delay: number;
}
/** 星の固定座標。常時アニメするので 30 個に絞って合成負荷を抑える。 */
const STARS: Star[] = Array.from({ length: 30 }, () => ({
  xPct: Math.random() * 100,
  yPct: Math.random() * 55,
  r: 0.6 + Math.random() * 1.4,
  delay: Math.random() * 3,
}));

interface SkyBackgroundProps {
  /** 0-1439 の総分数。 */
  totalMinutes: number;
}

const SkyBackground: Component<SkyBackgroundProps> = (props) => {
  /** 2 分刻みに量子化した分。目で差がわからない粒度で repaint 頻度を下げる。 */
  const quantizedMin = createMemo(() => Math.floor(props.totalMinutes / 2) * 2);
  const sky = createMemo(() => skyAtMinute(quantizedMin()));
  const sun = createMemo(() => sunPosition(props.totalMinutes));
  const moon = createMemo(() => moonPosition(props.totalMinutes));
  const starOp = createMemo(() => Math.max(0, nightness(quantizedMin()) - 0.3) * 1.4);
  const starsVisible = createMemo(() => starOp() > 0.01);

  return (
    <div
      class="sky-background absolute inset-0 overflow-hidden"
      style={{
        background: `linear-gradient(180deg, ${sky().top} 0%, ${sky().bottom} 100%)`,
      }}
    >
      {/* 星 (夜のみ。不要な時は DOM ごと外す) */}
      <Show when={starsVisible()}>
        <div
          class="absolute inset-0"
          style={{ opacity: starOp(), transition: "opacity 0.8s ease" }}
        >
          <For each={STARS}>
            {(s) => (
              <div
                class="absolute rounded-full bg-white star-twinkle"
                style={{
                  left: `${s.xPct}%`,
                  top: `${s.yPct}%`,
                  width: `${s.r * 2}px`,
                  height: `${s.r * 2}px`,
                  animation: `twinkle 3s ease-in-out ${s.delay}s infinite`,
                  "will-change": "opacity",
                }}
              />
            )}
          </For>
        </div>
      </Show>

      <Show when={sun().visible}>
        <div
          class="absolute top-0 left-0"
          style={{
            width: "120px",
            height: "120px",
            transform: `translate(calc(${sun().xPct}vw - 50%), calc(${sun().yPct}vh - 50%))`,
            "will-change": "transform",
          }}
        >
          <svg viewBox="-60 -60 120 120" class="w-full h-full">
            {/* 外側の光彩 (drop-shadow を避けて透明ディスク重ねで代替) */}
            <circle cx="0" cy="0" r="54" fill="#FFE880" opacity="0.25" />
            <circle cx="0" cy="0" r="44" fill="#FFE060" opacity="0.35" />
            {/* 12 本の光線 */}
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

      <Show when={moon().visible}>
        <div
          class="absolute top-0 left-0"
          style={{
            width: "84px",
            height: "84px",
            transform: `translate(calc(${moon().xPct}vw - 50%), calc(${moon().yPct}vh - 50%))`,
            "will-change": "transform",
          }}
        >
          <svg viewBox="-42 -42 84 84" class="w-full h-full">
            <defs>
              {/* 満月から少し右上に欠けた円を差し引いて三日月にする */}
              <mask id="crescent-mask">
                <rect x="-42" y="-42" width="84" height="84" fill="black" />
                <circle cx="0" cy="0" r="32" fill="white" />
                <Show when={!isFullMoonActive()}>
                  <circle cx="14" cy="-8" r="28" fill="black" />
                </Show>
              </mask>
            </defs>
            {/* 光彩代わりの透明ディスク */}
            <circle cx="0" cy="0" r="40" fill="#FFF5C8" opacity="0.12" />
            {/* 月本体 (三日月) */}
            <g mask="url(#crescent-mask)">
              <circle cx="0" cy="0" r="32" fill="#FFF5C8" />
              <circle cx="0" cy="0" r="32" fill="#FFE88A" opacity="0.5" />
              <circle cx="0" cy="0" r="31" fill="none" stroke="#E8C060" stroke-width="1.2" />
            </g>
            {/* 顔 (三日月の太い側に寄せて配置) */}
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
