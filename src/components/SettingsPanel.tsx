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
import { useButtonsDimmedDuringMergeFlip } from "../features/free-rotation/merge-animation";
import { withViewTransition, MORPHING_SLOT } from "../features/view-transition";
import { openPickerAtElement } from "../features/schedule/picker";

const SettingsPanel: Component = () => {
  const { t } = useI18n();
  const isLandscape = useOrientation();
  const { start: startRewind, stop: stopRewind } = useRewindHold();
  const buttonsDimmed = useButtonsDimmedDuringMergeFlip();

  const toggleRotate = () =>
    withViewTransition(() => transition(isRotating() ? "clock" : "freeRotate"));

  /** 子どもの指でも押しやすいサイズ (WCAG 最小 44px を大きく上回る、タブレットでさらに大きく)。
   *  whitespace-nowrap は left+translate で右端寄せするボタン (1ふんもどす) が shrink-to-fit で
   *  CJK 縦書きになるのを防ぐため。 */
  const btnClass =
    "px-2.5 py-1 tablet:px-6 tablet:py-4 rounded-full text-base tablet:text-xl font-bold shadow-md active:scale-90 transition-all bg-white/80 text-gray-700 whitespace-nowrap";

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
        class={`fixed top-2 right-2 z-50 ${btnClass}`}
        onPointerDown={toggleRotate}
        aria-label={isRotating() ? t("settings.rotateExit") : t("settings.rotateEnter")}
      />

      <Show when={isRotating()}>
        {/* 左下: じどうかいてん 開始/停止 (autoRotate/freeRotate 問わず常時表示) */}
        <button
          class={`fixed bottom-2 left-2 z-50 ${btnClass}`}
          onPointerDown={() => transition(clockMode() === "autoRotate" ? "freeRotate" : "autoRotate")}
          aria-label={clockMode() === "autoRotate" ? t("settings.autoStop") : t("settings.autoStart")}
        />

        <Show when={clockMode() === "freeRotate"}>
          {/* 左上: かさねる/わける (表示は切替先) */}
          <button
            class={`fixed top-2 left-2 z-50 ${btnClass}`}
            onPointerDown={toggleLayout}
            aria-label={mergedVisible() ? t("settings.splitToTwo") : t("settings.mergeToSingle")}
          />

          {/* よてい (予定追加): MORPHING_SLOT.LEFT を AM/PM バッジ (通常モード) と共有して
              モード遷移時にブラウザがモーフィング描画する。
              picker 起点はこのボタン中心。e.currentTarget でその場の要素を渡すことで let-ref を持たず
              済ませている (parent SettingsPanel が unmount されない一方この button は <Show> で
              出入りするため、let-ref 方式だと unmount 後に detached button が retain される)。 */}
          <button
            class={
              "settings-button-transition fixed z-50 " +
              (isLandscape()
                ? (mergedVisible()
                    ? "left-[82%] top-2 -translate-x-1/2"
                    : "left-1/2 top-2 -translate-x-1/2")
                : (mergedVisible()
                    ? "left-2 top-[80%] -translate-y-1/2"
                    : "left-2 top-1/2 -translate-y-1/2")) +
              " " + btnClass
            }
            style={{
              opacity: buttonsDimmed() ? 0.08 : 1,
              "view-transition-name": MORPHING_SLOT.LEFT,
            }}
            onPointerDown={(e) => openPickerAtElement(e.currentTarget as HTMLButtonElement)}
            aria-label={t("schedule.add")}
          />

          {/* 1 ふんもどす: 通常モードのパレット切替と MORPHING_SLOT.RIGHT を共有 (slot 一覧は
              features/view-transition.ts)。長押しで連続。 */}
          <button
            class={
              "settings-button-transition fixed z-50 " +
              (isLandscape()
                ? (mergedVisible()
                    ? "left-[82%] top-[calc(100%-0.5rem)] -translate-x-1/2 -translate-y-full"
                    : "left-1/2 top-[calc(100%-0.5rem)] -translate-x-1/2 -translate-y-full")
                : (mergedVisible()
                    ? "left-[calc(100%-0.5rem)] top-[80%] -translate-x-full -translate-y-1/2"
                    : "left-[calc(100%-0.5rem)] top-1/2 -translate-x-full -translate-y-1/2")) +
              " " + btnClass
            }
            style={{
              "touch-action": "none",
              opacity: buttonsDimmed() ? 0.08 : 1,
              "view-transition-name": MORPHING_SLOT.RIGHT,
            }}
            onPointerDown={startRewind}
            onPointerUp={stopRewind}
            onPointerCancel={stopRewind}
            aria-label={t("settings.rewindMinute")}
          />

          {/* 右下: らんだむ (押すたびに 15 分刻みの別時刻へ) */}
          <button
            class={`fixed bottom-2 right-2 z-50 ${btnClass}`}
            onPointerDown={randomizeRotate}
            aria-label={t("settings.random")}
          />
        </Show>
      </Show>

      <Show when={!isRotating()}>
        {/* 左上: 24h / 12h */}
        <button
          class={`fixed top-2 left-2 z-50 ${btnClass}`}
          onPointerDown={toggleTimeFormat}
          aria-label={timeFormat() === "24h" ? t("settings.hour12") : t("settings.hour24")}
        />

        {/* 左下: くわしく / すっきり */}
        <button
          class={`fixed bottom-2 left-2 z-50 ${btnClass}`}
          onPointerDown={toggleDetailMode}
          aria-label={detailMode() === "kuwashiku" ? t("settings.sukkiri") : t("settings.kuwashiku")}
        />

        {/* 右下: くぎり / ばっじ */}
        <button
          class={`fixed bottom-2 right-2 z-50 ${btnClass}`}
          onPointerDown={toggleColorMode}
          aria-label={colorMode() === "sector" ? t("settings.badge") : t("settings.sector")}
        />

        {/* 次パレット名: portrait = 右センター / landscape = 下センター */}
        <button
          class={
            "fixed z-50 " +
            (isLandscape()
              ? "bottom-2 left-1/2 -translate-x-1/2"
              : "right-2 top-1/2 -translate-y-1/2") +
            " " + btnClass
          }
          style={{ "view-transition-name": "clock-right-slot" }}
          onPointerDown={cyclePalette}
          aria-label={t(`palette.${getNextPalette(paletteId()).id}` as never)}
        />
      </Show>
    </>
  );
};

export default SettingsPanel;
