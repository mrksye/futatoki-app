import { createSignal } from "solid-js";

/**
 * 言語選択リングメニューの状態。ActivityPicker が angle (deg) で回転を表すのに対し、こちらは
 * 角丸四角 path 上を進む length offset (px) で表現する。
 */

export interface LanguagePickerOrigin {
  x: number;
  y: number;
}

const [languagePickerOpen, setOpenRaw] = createSignal(false);
const [languagePickerOrigin, setOriginRaw] = createSignal<LanguagePickerOrigin | null>(null);
const [languagePickerLengthOffset, setLengthOffsetRaw] = createSignal(0);

export { languagePickerOpen, languagePickerOrigin, languagePickerLengthOffset };

export const openLanguagePicker = (origin: LanguagePickerOrigin) => {
  setOriginRaw(origin);
  setLengthOffsetRaw(0);
  setOpenRaw(true);
};

export const openLanguagePickerAtElement = (el: HTMLElement) => {
  const rect = el.getBoundingClientRect();
  openLanguagePicker({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });
};

export const closeLanguagePicker = () => {
  setOpenRaw(false);
};

export const rotateLanguagePicker = (deltaLengthPx: number) => {
  setLengthOffsetRaw(v => v + deltaLengthPx);
};

/** open 直後に「現在 locale を visible 中央に揃える」用途で length offset を絶対値で set する。
 *  通常の drag/wheel/inertia は rotateLanguagePicker (差分加算) を使う。 */
export const setLanguagePickerLengthOffset = (lengthPx: number) => {
  setLengthOffsetRaw(lengthPx);
};
