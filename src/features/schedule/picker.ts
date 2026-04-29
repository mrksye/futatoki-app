import { createSignal, createEffect, createRoot, on } from "solid-js";
import { rotateMinutes } from "../free-rotation/state";

/**
 * 予定アイコン選択用リングメニューの状態。openPicker(origin) でタップ位置を中心に展開、
 * closePicker() で閉じる、rotatePicker(delta) でリング回転オフセット (deg) を加算。
 * 内部の生 setter は未 export (action 経由で書き換える)。
 */

export interface PickerOrigin {
  /** viewport 座標 (px)。 */
  x: number;
  y: number;
}

const [pickerOpen, setOpenRaw] = createSignal(false);
const [pickerOrigin, setOriginRaw] = createSignal<PickerOrigin | null>(null);
const [pickerRotation, setRotationRaw] = createSignal(0);

export { pickerOpen, pickerOrigin, pickerRotation };

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

/** 防御的 auto-close。rotateMinutes が変化したら閉じる (通常は overlay で時計操作はブロックされるが、
 *  autoRotate モード等で変化する可能性に備える)。 */
createRoot(() => {
  createEffect(on(rotateMinutes, () => {
    if (pickerOpen()) closePicker();
  }, { defer: true }));
});
