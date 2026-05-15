import { createSignal } from "solid-js";

/**
 * 言語選択リングメニューの状態。openLocalePicker(origin) でトリガーボタン中心に展開、
 * closeLocalePicker() で閉じる、rotateLocalePicker(deltaLength) で path 上の length offset
 * (px) を加算する。SchedulePicker は angle (deg) で回転するが、こちらは角丸四角形 path 上を
 * 進む length 単位で回す。
 */

export interface LocalePickerOrigin {
  /** viewport 座標 (px)。トリガーボタンの中心。 */
  x: number;
  y: number;
}

const [localePickerOpen, setOpenRaw] = createSignal(false);
const [localePickerOrigin, setOriginRaw] = createSignal<LocalePickerOrigin | null>(null);
/** path 上の length offset (px)。アイテム i の path 位置は (offset + i * totalLength / N) % totalLength。
 *  drag で正方向 (CW 進行) に動かすと値が増える。 */
const [localePickerLengthOffset, setLengthOffsetRaw] = createSignal(0);

export { localePickerOpen, localePickerOrigin, localePickerLengthOffset };

export const openLocalePicker = (origin: LocalePickerOrigin) => {
  setOriginRaw(origin);
  setLengthOffsetRaw(0);
  setOpenRaw(true);
};

export const openLocalePickerAtElement = (el: HTMLElement) => {
  const rect = el.getBoundingClientRect();
  openLocalePicker({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });
};

export const closeLocalePicker = () => {
  setOpenRaw(false);
};

export const rotateLocalePicker = (deltaLengthPx: number) => {
  setLengthOffsetRaw(v => v + deltaLengthPx);
};

/** length offset を絶対値で set。open 直後に「現在 locale を visible 中央に揃える」用途で使う。
 *  通常の drag/wheel/inertia は rotateLocalePicker (差分加算) を使うこと。 */
export const setLocalePickerLengthOffset = (lengthPx: number) => {
  setLengthOffsetRaw(lengthPx);
};
