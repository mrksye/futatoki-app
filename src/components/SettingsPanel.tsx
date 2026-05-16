import { Show, type Component } from "solid-js";
import { useOrientation } from "../hooks/useOrientation";
import { useI18n } from "../i18n";
import { getNextPalette, palettes } from "../colors";
import { colorMode, toggleColorMode } from "../features/settings/color-mode";
import { timeFormat, toggleTimeFormat } from "../features/settings/time-format";
import { detailMode, toggleDetailMode } from "../features/settings/detail-mode";
import { paletteId, cyclePalette } from "../features/settings/palette";
import { usePaletteClearance } from "../features/layout/palette-clearance";
import {
  clockMode,
  isRotating,
  mergedVisible,
  transition,
  toggleLayout,
} from "../features/free-rotation/state";
import { useRewindHold } from "../features/free-rotation/rewind";
import { randomizeRotate } from "../features/free-rotation/random-time";
import { openPickerAtElement } from "../features/activity/picker";
import { openLocalePickerAtElement } from "../features/locale-picker/state";
import { LOCALE_FLAG } from "../features/locale-picker/flags";

const SettingsPanel: Component = () => {
  const { t, locale, numeralTogglePreview, toggleNumeralSystem } = useI18n();
  const currentFlag = () => LOCALE_FLAG[locale().code] ?? locale().code;
  const isLandscape = useOrientation();
  const { start: startRewind, stop: stopRewind } = useRewindHold();

  /** Slot ボタンの dim animation (slot-crossfade) を 560ms だけ走らせる。とけい/かいてん や
   *  かさねる/わける で時計が大きく動くタイミングでスロットボタンを薄くし、子どもの視線を時計の
   *  合体アニメに集中させる UX 設計。merge animation の duration (560ms) と完全同期。 */
  const withSlotDim = (fn: () => void) => () => {
    document.body.classList.add("slot-transitioning");
    setTimeout(() => document.body.classList.remove("slot-transitioning"), 560);
    fn();
  };

  const toggleRotate = withSlotDim(() =>
    transition(isRotating() ? "clock" : "freeRotate"));
  const toggleLayoutDimmed = withSlotDim(toggleLayout);

  /** 子どもの指でも押しやすいサイズ (WCAG 最小 44px を大きく上回る、タブレットでさらに大きく)。
   *  whitespace-nowrap は left+translate で右端寄せするボタン (1ふんもどす) が shrink-to-fit で
   *  CJK 縦書きになるのを防ぐため。 */
  const btnClass =
    "px-2.5 py-1 tablet:px-6 tablet:py-4 rounded-full text-base tablet:text-xl font-bold shadow-md active:scale-90 transition-all bg-white/80 text-gray-700 whitespace-nowrap";

  /** autoRotate 左上の言語・数字体系ボタン専用の縮小版。padding と font-size を一段下げて
   *  「子どもが触ってはいけない設定」として存在感を抑える。font-size は call site で個別指定。 */
  const compactBtnClass =
    "px-2 py-0.5 tablet:px-4 tablet:py-2 rounded-full font-bold shadow-md active:scale-90 transition-all bg-white/80 text-gray-700 whitespace-nowrap";

  // 全 palette ラベルの max ボタン寸法を測って ClockLayout に渡す。floating な palette ボタンが
  // 時計と被る locale (fr 等) では、その寸法ぶん時計 SVG の max size を縮める用途。
  usePaletteClearance(
    () => palettes.map((p) => t(`palette.${p.id}` as never)),
    btnClass,
  );

  return (
    <>
      {/* 右上: じゆうかいてん / もどる。aria-label を ::before で描画 (iOS 長押し callout 対策)。 */}
      <button
        class={`fixed top-[var(--safe-edge-top)] right-[var(--safe-edge-right)] z-50 ${btnClass}`}
        onPointerDown={toggleRotate}
        aria-label={isRotating() ? t("settings.rotateExit") : t("settings.rotateEnter")}
      />

      <Show when={isRotating()}>
        {/* 左下: じどうかいてん 開始/停止 (autoRotate/freeRotate 問わず常時表示) */}
        <button
          class={`fixed bottom-[var(--safe-edge-bottom)] left-[var(--safe-edge-left)] z-50 ${btnClass}`}
          onPointerDown={() => transition(clockMode() === "autoRotate" ? "freeRotate" : "autoRotate")}
          aria-label={clockMode() === "autoRotate" ? t("settings.autoStop") : t("settings.autoStart")}
        />

        <Show when={clockMode() === "freeRotate"}>
          {/* 左上: かさねる/わける (表示は切替先) */}
          <button
            class={`fixed top-[var(--safe-edge-top)] left-[var(--safe-edge-left)] z-50 ${btnClass}`}
            onPointerDown={toggleLayoutDimmed}
            aria-label={mergedVisible() ? t("settings.splitToTwo") : t("settings.mergeToSingle")}
          />

          {/* 右下: らんだむ (押すたびに 15 分刻みの別時刻へ) */}
          <button
            class={`fixed bottom-[var(--safe-edge-bottom)] right-[var(--safe-edge-right)] z-50 ${btnClass}`}
            onPointerDown={randomizeRotate}
            aria-label={t("settings.random")}
          />
        </Show>

        {/* 左上: 言語選択 + 数字体系トグル (autoRotate 中のみ)。国旗ボタンは現在 locale の flag を
         *  直接描画 (before:hidden で aria-label の ::before 描画を抑制) し、タップで言語ピッカーを
         *  起動する。数字体系トグルは alternate を持つ locale でのみ表示し、ラベル "123…" ⇄
         *  "১২৩…" のように切替先の数字グリフを出して default の方向が逆でも整合する。 */}
        <Show when={clockMode() === "autoRotate"}>
          <div class="fixed top-[var(--safe-edge-top)] left-[var(--safe-edge-left)] z-50 flex gap-2">
            <button
              class={`${compactBtnClass} before:hidden text-lg tablet:text-xl leading-none`}
              onPointerDown={(e) => openLocalePickerAtElement(e.currentTarget as HTMLButtonElement)}
              aria-label={locale().endonym}
            >
              {currentFlag()}
            </button>
            <Show when={numeralTogglePreview()}>
              {(preview) => (
                <button
                  class={`${compactBtnClass} text-xs tablet:text-sm`}
                  onPointerDown={toggleNumeralSystem}
                  aria-label={`${preview()}…`}
                />
              )}
            </Show>
          </div>
        </Show>
      </Show>

      <Show when={!isRotating()}>
        {/* 左上: 24h / 12h */}
        <button
          class={`fixed top-[var(--safe-edge-top)] left-[var(--safe-edge-left)] z-50 ${btnClass}`}
          onPointerDown={toggleTimeFormat}
          aria-label={timeFormat() === "24h" ? t("settings.hour12") : t("settings.hour24")}
        />

        {/* 左下: くわしく / すっきり */}
        <button
          class={`fixed bottom-[var(--safe-edge-bottom)] left-[var(--safe-edge-left)] z-50 ${btnClass}`}
          onPointerDown={toggleDetailMode}
          aria-label={detailMode() === "kuwashiku" ? t("settings.sukkiri") : t("settings.kuwashiku")}
        />

        {/* 右下: くぎり / ばっじ */}
        <button
          class={`fixed bottom-[var(--safe-edge-bottom)] right-[var(--safe-edge-right)] z-50 ${btnClass}`}
          onPointerDown={toggleColorMode}
          aria-label={colorMode() === "sector" ? t("settings.badge") : t("settings.sector")}
        />
      </Show>

      {/* スロットペアボタン群 (always-mount, opacity でクロスフェード)。とけい/かいてん 切替時に
          AM/PM バッジ ↔ 予定追加、パレット ↔ 1ふんもどす が同じスロット位置を共有して 560ms の
          bouncy 位置 transition でスライドしつつ、overshoot 折返し付近 (280-380ms) で 100ms の
          短いクロスフェードで内容を入れ替える。AM/PM バッジ側は ClockLayout に居る (z-20)。
          freeRotate 内 かさねる/わける でも位置 (top/left) が動くので、両モードで共通の position
          式を使う。 */}

      {/* LEFT スロット 予定追加: freeRotate 中だけ可視 */}
      <button
        class={
          "fixed z-50 slot-crossfade " +
          (isLandscape()
            ? (mergedVisible()
                ? "left-[82%] top-[var(--safe-edge-top)] -translate-x-1/2"
                : "left-1/2 top-[var(--safe-edge-top)] -translate-x-1/2")
            : (mergedVisible()
                ? "left-[var(--safe-edge-left)] top-[80%] -translate-y-1/2"
                : "left-[var(--safe-edge-left)] top-1/2 -translate-y-1/2")) +
          " " + btnClass
        }
        style={{
          opacity: clockMode() === "freeRotate" ? 1 : 0,
          "pointer-events": clockMode() === "freeRotate" ? "auto" : "none",
        }}
        onPointerDown={(e) => openPickerAtElement(e.currentTarget as HTMLButtonElement)}
        aria-label={t("activity.add")}
      />

      {/* RIGHT スロット パレット: clock モード中だけ可視 */}
      <button
        class={
          "fixed z-50 slot-crossfade " +
          (isLandscape()
            ? (mergedVisible()
                ? "bottom-[var(--safe-edge-bottom)] left-[82%] -translate-x-1/2"
                : "bottom-[var(--safe-edge-bottom)] left-1/2 -translate-x-1/2")
            : (mergedVisible()
                ? "right-[var(--safe-edge-right)] top-[80%] -translate-y-1/2"
                : "right-[var(--safe-edge-right)] top-1/2 -translate-y-1/2")) +
          " " + btnClass
        }
        style={{
          opacity: !isRotating() ? 1 : 0,
          "pointer-events": !isRotating() ? "auto" : "none",
        }}
        onPointerDown={cyclePalette}
        aria-label={t(`palette.${getNextPalette(paletteId()).id}` as never)}
      />

      {/* RIGHT スロット 1ふんもどす: freeRotate 中だけ可視 */}
      <button
        class={
          "fixed z-50 slot-crossfade " +
          (isLandscape()
            ? (mergedVisible()
                ? "bottom-[var(--safe-edge-bottom)] left-[82%] -translate-x-1/2"
                : "bottom-[var(--safe-edge-bottom)] left-1/2 -translate-x-1/2")
            : (mergedVisible()
                ? "right-[var(--safe-edge-right)] top-[80%] -translate-y-1/2"
                : "right-[var(--safe-edge-right)] top-1/2 -translate-y-1/2")) +
          " " + btnClass
        }
        style={{
          "touch-action": "none",
          opacity: clockMode() === "freeRotate" ? 1 : 0,
          "pointer-events": clockMode() === "freeRotate" ? "auto" : "none",
        }}
        onPointerDown={startRewind}
        onPointerUp={stopRewind}
        onPointerCancel={stopRewind}
        aria-label={t("settings.rewindMinute")}
      />
    </>
  );
};

export default SettingsPanel;
