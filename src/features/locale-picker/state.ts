import { createSignal } from "solid-js";

/**
 * 言語選択リングメニューの状態。ActivityPicker が angle (deg) で回転を表すのに対し、こちらは
 * 角丸四角 path 上を進む length offset (px) で表現する。
 */

export interface LocalePickerOrigin {
  x: number;
  y: number;
}

const [localePickerOpen, setOpenRaw] = createSignal(false);
const [localePickerOrigin, setOriginRaw] = createSignal<LocalePickerOrigin | null>(null);
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

/** open 直後に「現在 locale を visible 中央に揃える」用途で length offset を絶対値で set する。
 *  通常の drag/wheel/inertia は rotateLocalePicker (差分加算) を使う。 */
export const setLocalePickerLengthOffset = (lengthPx: number) => {
  setLengthOffsetRaw(lengthPx);
};
