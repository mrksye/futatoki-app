/**
 * 色の基本演算。"#rrggbb" 16 進と [r, g, b] の相互変換と、2 色の線形補間 (RGB 空間)。
 * SkyBackground の時間帯グラデーションと TimerWedge の残り時間グラデーションが共有する。
 */

export function hexToRgb(hex: string): [number, number, number] {
  const v = parseInt(hex.slice(1), 16);
  return [(v >> 16) & 0xff, (v >> 8) & 0xff, v & 0xff];
}

export function rgbToHex(r: number, g: number, b: number): string {
  const to = (v: number) => Math.round(v).toString(16).padStart(2, "0");
  return `#${to(r)}${to(g)}${to(b)}`;
}

/** a (t=0) から b (t=1) へ RGB を線形補間した "#rrggbb"。 */
export function lerpColor(a: string, b: string, t: number): string {
  const [ar, ag, ab] = hexToRgb(a);
  const [br, bg, bb] = hexToRgb(b);
  return rgbToHex(ar + (br - ar) * t, ag + (bg - ag) * t, ab + (bb - ab) * t);
}
