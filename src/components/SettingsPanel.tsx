import { Show, type Component } from "solid-js";
import { useOrientation } from "../hooks/useOrientation";
import { useI18n } from "../i18n";
import { getNextPalette } from "../colors";
// ===== 表示設定 =====
import { colorMode, toggleColorMode } from "../features/settings/color-mode";
import { timeFormat, toggleTimeFormat } from "../features/settings/time-format";
import { detailMode, toggleDetailMode } from "../features/settings/detail-mode";
import { paletteId, cyclePalette } from "../features/settings/palette";
// ===== 自由回転モード =====
import {
  rotateActive,
  rotateMode,
  mergedVisible,
  enterRotate,
  exitRotate,
  setRotateMode,
  toggleMerged,
} from "../features/free-rotation/state";
import { useRewindHold } from "../features/free-rotation/rewind";
import { randomizeRotate } from "../features/free-rotation/random-time";
import { useButtonsDimmedDuringMergeFlip } from "../features/free-rotation/merge-animation";
import { withViewTransition, MORPHING_SLOT } from "../features/view-transition";
// ===== 予定モード ピッカー =====
import { pickerOpen, openPicker, closePicker } from "../features/schedule/picker";

const SettingsPanel: Component = () => {
  const { t } = useI18n();
  const isLandscape = useOrientation();
  const { start: startRewind, stop: stopRewind } = useRewindHold();
  const buttonsDimmed = useButtonsDimmedDuringMergeFlip();

  // 予定 (よてい) ボタンの位置を ref で取り、タップ時にリングメニューの中心位置として渡す
  let yoteiBtnRef: HTMLButtonElement | undefined;

  const toggleRotate = () =>
    withViewTransition(() => (rotateActive() ? exitRotate() : enterRotate()));

  // 子どもの指でも押しやすいサイズに (WCAG最小44pxを大きく上回る)
  // タブレットではさらに大きめに (tablet: は幅 >= 768px かつ 高さ >= 480px。
  // スマホ横向きのように幅は広いが高さが低いケースは除外する)
  // whitespace-nowrap: left+translateで右端寄せするボタン (1ふんもどす) が
  // shrink-to-fitでCJK縦書きになるのを防ぐ
  const btnClass =
    "px-2.5 py-1 tablet:px-6 tablet:py-4 rounded-full text-base tablet:text-xl font-bold shadow-md active:scale-90 transition-all bg-white/80 backdrop-blur-sm text-gray-700 whitespace-nowrap";

  // かさね/わけ切替時のボタン位置アニメ + dim 用 transition は
  // .settings-button-transition class で定義 (reduce-motion 対応のため inline 化を避ける)。

  return (
    <>
      {/* 右上: じゆうかいてん / もどる (常時表示。上位モードのトグル)
          label は aria-label 経由で ::before が描画する (iOS 長押し callout 対策) */}
      <button
        class={`fixed top-2 right-2 z-50 ${btnClass}`}
        onPointerDown={toggleRotate}
        aria-label={rotateActive() ? t("settings.rotateExit") : t("settings.rotateEnter")}
      />

      {/* ===== 自由回転モード専用UI ===== */}
      <Show when={rotateActive()}>
        {/* 左下: じどうかいてん 開始/停止 (auto/manual問わず常時表示) */}
        <button
          class={`fixed bottom-2 left-2 z-50 ${btnClass}`}
          onPointerDown={() => setRotateMode(rotateMode() === "auto" ? "manual" : "auto")}
          aria-label={rotateMode() === "auto" ? t("settings.autoStop") : t("settings.autoStart")}
        />

        {/* manualサブモードのみの操作UI (auto中は非表示) */}
        <Show when={rotateMode() === "manual"}>
          {/* 左上: かさねる/わける (表示は切替先) */}
          <button
            class={`fixed top-2 left-2 z-50 ${btnClass}`}
            onPointerDown={toggleMerged}
            aria-label={mergedVisible() ? t("settings.splitToTwo") : t("settings.mergeToSingle")}
          />

          {/* よてい (予定追加): 押すとリングメニューが出てプリセット絵文字を選べる
              横長分け=上センター, 横長重ね=右上 / 縦長分け=左センター, 縦長重ね=左下寄り
              MORPHING_SLOT.LEFT を AM/PM バッジ (通常モード) と共有 */}
          <button
            ref={(el) => { yoteiBtnRef = el; }}
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
            onClick={() => {
              if (pickerOpen()) {
                closePicker();
                return;
              }
              if (!yoteiBtnRef) return;
              const rect = yoteiBtnRef.getBoundingClientRect();
              openPicker({
                x: rect.left + rect.width / 2,
                y: rect.top + rect.height / 2,
              });
            }}
            aria-label={t("schedule.add")}
          />

          {/* 1ふんもどす (自由回転 manual のみ)
              通常モードのパレット切替と MORPHING_SLOT.RIGHT を共有し、
              モード遷移時にブラウザがモーフィング描画する。
              (slot 共有関係の一覧は features/view-transition.ts を参照)
              横長分け=下センター, 横長重ね=右下寄り
              縦長分け=右センター, 縦長重ね=右下寄り
              縦横アニメ用に left+top+transform で統一、長押しで連続 */}
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

          {/* 右下: らんだむ (押すたびに15分刻みの別時刻へ) */}
          <button
            class={`fixed bottom-2 right-2 z-50 ${btnClass}`}
            onPointerDown={randomizeRotate}
            aria-label={t("settings.random")}
          />
        </Show>
      </Show>

      {/* ===== 通常モードUI (自由回転時は非表示) ===== */}
      <Show when={!rotateActive()}>
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

        {/* 次パレット名ボタン: ポートレート=右センター, ランドスケープ=下センター */}
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
