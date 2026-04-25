import { createSignal, createEffect, createRoot, on } from "solid-js";
import { rotateMinutes } from "../free-rotation/state";

/**
 * 予定アイコン選択用リングメニューの状態。
 *
 * 仕様:
 *   - openPicker(origin) で開く: タップ位置 (= 予定ボタンの中心) を中心に
 *     11 個のアイコンが放射状に配置されたリングメニューが出現
 *   - closePicker() で閉じる
 *   - rotatePicker(delta) でリング回転オフセット (deg) を加算
 *   - 自動閉じ: rotateMinutes が変わったら閉じる (overlay でブロックされる想定だが念のため)
 *
 * Public API:
 *   - accessor: pickerOpen, pickerOrigin, pickerRotation
 *   - action:   openPicker, closePicker, rotatePicker
 *
 * 内部の生 setter は意図的に export していない。
 */

export interface PickerOrigin {
  /** viewport 座標 (px) */
  x: number;
  y: number;
}

// ===== Internal state =====
const [pickerOpen, setOpenRaw] = createSignal(false);
const [pickerOrigin, setOriginRaw] = createSignal<PickerOrigin | null>(null);
const [pickerRotation, setRotationRaw] = createSignal(0);

// ===== Public accessors =====
export { pickerOpen, pickerOrigin, pickerRotation };

// ===== Public actions =====

export const openPicker = (origin: PickerOrigin) => {
  setOriginRaw(origin);
  setRotationRaw(0);
  setOpenRaw(true);
};

/** 要素中心を origin にして開く糖衣。call site の rect 計算を不要にする。 */
export const openPickerAtElement = (el: HTMLElement) => {
  const rect = el.getBoundingClientRect();
  openPicker({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });
};

export const closePicker = () => {
  setOpenRaw(false);
};

export const rotatePicker = (deltaDeg: number) => {
  setRotationRaw(r => r + deltaDeg);
};

// 防御的: rotateMinutes が変化した時は ピッカーを閉じる
// (通常は overlay で時計操作はブロックされるが、auto モード等で変化する可能性に備える)
createRoot(() => {
  createEffect(on(rotateMinutes, () => {
    if (pickerOpen()) closePicker();
  }, { defer: true }));
});
