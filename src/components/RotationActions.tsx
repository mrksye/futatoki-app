import { Show, type Component } from "solid-js";
import { useOrientation } from "../hooks/useOrientation";
import { useI18n } from "../i18n";
import {
  clockMode,
  isRotating,
  mergedVisible,
  toggleLayout,
} from "../features/free-rotation/state";
import { useRewindHold } from "../features/free-rotation/rewind";
import { randomizeRotate } from "../features/free-rotation/random-time";
import { openPickerAtElement } from "../features/activity/picker";
import { usePaletteClearance } from "../features/layout/palette-clearance";
import RewindIcon from "./icons/RewindIcon";

/**
 * 回転モード時のサブ操作ボタン群。 ModePicker / SettingsPopover の外に残る floating UI:
 *  - LEFT slot (中央上/中央左): できごと追加 (freeRotate)。AM/PM バッジと同位置で crossfade。
 *  - RIGHT slot (中央下/中央右): 1ふんもどす (freeRotate)。長押しで連続巻き戻し。
 *  - 左下: かさねる/わける (freeRotate)。
 *  - 右下: らんだむ (freeRotate)。
 *
 * AM/PM バッジは ClockLayout 側に居て同じ slot 位置を共有する (slot-crossfade で 100ms 入れ替え)。
 */
const RotationActions: Component = () => {
  const { t, formatNumeral } = useI18n();
  const isLandscape = useOrientation();
  const { start: startRewind, stop: stopRewind } = useRewindHold();

  const btnClass =
    "px-2.5 py-1 tablet:px-6 tablet:py-4 rounded-full text-base tablet:text-xl font-bold shadow-md active:scale-90 transition-all bg-white/80 text-gray-700 whitespace-nowrap";

  // 1ふんもどす ボタンは icon 化された横長 pill。寸法は pill ボタン (text-base+py-1 で「1ふんもどす」
  // 文字を載せた時とほぼ同じ box height 32 / 60px、width 80 / 120px) と並んだ時に違和感が無いよう
  // 固定。icon は中央寄せで左右に空白スペースを取る。`before:hidden` で aria-label の ::before
  // 描画を抑止し、中身は RewindIcon。fixed w/h なので ghost button (usePaletteClearance) も
  // 同じ寸法を再現できる。
  const rewindBtnClass =
    "w-20 h-8 tablet:w-[120px] tablet:h-[60px] rounded-full shadow-md active:scale-90 transition-all bg-white/80 text-gray-700 flex items-center justify-center before:hidden";

  // 中央下/中央右 slot (= 1ふんもどす) と時計の幾何的衝突を避けるため、ボタン寸法を ClockLayout に
  // 渡す。旧 SettingsPanel では palette ボタン群を測っていたが、palette は popover に移った。さらに
  // 1ふんもどす も icon 化で正円固定になったので ghost button の幅は CSS の w-* で決まる。ラベル
  // 配列は API 上必要で 1 要素入れているだけ (aria-label は SR 用に残るが ::before は hide)。
  usePaletteClearance(
    () => [t("settings.rewindMinute", { n: formatNumeral(1) })],
    rewindBtnClass,
  );

  return (
    <>
      <Show when={isRotating()}>
        {/* 下手前 (start, LTR では左下 / RTL では右下): かさねる/わける (表示は切替先、freeRotate 時のみ可視) */}
        <Show when={clockMode() === "freeRotate"}>
          <button
            class={`fixed bottom-[var(--safe-edge-bottom)] start-[var(--safe-edge-start)] z-50 ${btnClass}`}
            onPointerDown={toggleLayout}
            aria-label={mergedVisible() ? t("settings.splitToTwo") : t("settings.mergeToSingle")}
          />

          {/* 下奥 (end, LTR では右下 / RTL では左下): らんだむ (押すたびに 15 分刻みの別時刻へ) */}
          <button
            class={`fixed bottom-[var(--safe-edge-bottom)] end-[var(--safe-edge-end)] z-50 ${btnClass}`}
            onPointerDown={randomizeRotate}
            aria-label={t("settings.random")}
          />
        </Show>
      </Show>

      {/* LEFT スロット できごと追加: freeRotate 中だけ可視。AM/PM バッジと同 slot で
          crossfade 入れ替わる (always-mount で opacity 0/1)。位置式は ClockLayout の
          AM/PM バッジと完全同期。 */}
      <button
        class={
          "fixed z-50 slot-crossfade " +
          (isLandscape()
            ? mergedVisible()
              ? "left-[82%] top-[var(--safe-edge-top)] -translate-x-1/2"
              : "left-1/2 top-[var(--safe-edge-top)] -translate-x-1/2"
            : mergedVisible()
              ? "left-[var(--safe-edge-left)] top-[80%] -translate-y-1/2"
              : "left-[var(--safe-edge-left)] top-1/2 -translate-y-1/2") +
          " " +
          btnClass
        }
        style={{
          opacity: clockMode() === "freeRotate" ? 1 : 0,
          "pointer-events": clockMode() === "freeRotate" ? "auto" : "none",
        }}
        onPointerDown={(e) => openPickerAtElement(e.currentTarget as HTMLButtonElement)}
        aria-label={t("activity.add")}
      />

      {/* RIGHT スロット 1ふんもどす: freeRotate 中だけ可視。長押しで連続。
          ラベル文字は出さず早戻し ⏪ (RewindIcon) を中央に描画。aria-label は SR 用に残す。 */}
      <button
        class={
          "fixed z-50 slot-crossfade " +
          (isLandscape()
            ? mergedVisible()
              ? "bottom-[var(--safe-edge-bottom)] left-[82%] -translate-x-1/2"
              : "bottom-[var(--safe-edge-bottom)] left-1/2 -translate-x-1/2"
            : mergedVisible()
              ? "right-[var(--safe-edge-right)] top-[80%] -translate-y-1/2"
              : "right-[var(--safe-edge-right)] top-1/2 -translate-y-1/2") +
          " " +
          rewindBtnClass
        }
        style={{
          "touch-action": "none",
          opacity: clockMode() === "freeRotate" ? 1 : 0,
          "pointer-events": clockMode() === "freeRotate" ? "auto" : "none",
        }}
        onPointerDown={startRewind}
        onPointerUp={stopRewind}
        onPointerCancel={stopRewind}
        aria-label={t("settings.rewindMinute", { n: formatNumeral(1) })}
      >
        <RewindIcon class="w-6 h-6 tablet:w-9 tablet:h-9" />
      </button>
    </>
  );
};

export default RotationActions;
