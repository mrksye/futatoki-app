import { Show, onCleanup, type Component } from "solid-js";
import { useSettings } from "../store/settings";
import { getNextPalette } from "../colors";
import { useOrientation } from "../hooks/useOrientation";
import { strings } from "../strings";

const SettingsPanel: Component = () => {
  const {
    settings,
    setColorMode,
    setTimeFormat,
    setDetailMode,
    cyclePalette,
    toggleRotateStyle,
    rotate,
    enterRotate,
    exitRotate,
    resetRotate,
    setRotateMinutes,
  } = useSettings();
  const isLandscape = useOrientation();

  const toggleColorMode = () =>
    setColorMode(settings.colorMode === "sector" ? "badge" : "sector");

  const toggleTimeFormat = () =>
    setTimeFormat(settings.timeFormat === "24h" ? "12h" : "24h");

  const toggleDetailMode = () =>
    setDetailMode(settings.detailMode === "kuwashiku" ? "sukkiri" : "kuwashiku");

  const toggleRotate = () => (rotate.active ? exitRotate() : enterRotate());

  // ===== 1分戻す（タップで-1、長押しで連続） =====
  let rewindHoldTimer: ReturnType<typeof setTimeout> | undefined;
  let rewindInterval: ReturnType<typeof setInterval> | undefined;

  const rewindTick = () => setRotateMinutes(rotate.minutes - 1);

  const stopRewind = () => {
    if (rewindHoldTimer) { clearTimeout(rewindHoldTimer); rewindHoldTimer = undefined; }
    if (rewindInterval) { clearInterval(rewindInterval); rewindInterval = undefined; }
  };

  const startRewind = (e: PointerEvent) => {
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    rewindTick();
    rewindHoldTimer = setTimeout(() => {
      rewindInterval = setInterval(rewindTick, 40);
    }, 250);
  };

  onCleanup(stopRewind);

  const btnClass =
    "px-3 py-1.5 rounded-full text-[11px] font-bold shadow-md active:scale-90 transition-all bg-white/80 backdrop-blur-sm text-gray-700";

  return (
    <>
      {/* 右上: じゆうかいてん / もどる（常時表示。上位モードのトグル） */}
      <button class={`fixed top-2 right-2 z-50 ${btnClass}`} onClick={toggleRotate}>
        {rotate.active ? strings.settings.rotateExit : strings.settings.rotateEnter}
      </button>

      {/* ===== 自由回転モード専用UI ===== */}
      <Show when={rotate.active}>
        {/* 左上: リセット */}
        <button class={`fixed top-2 left-2 z-50 ${btnClass}`} onClick={resetRotate}>
          {strings.settings.rotateReset}
        </button>

        {/* スタイル切替（横長=上センター, 縦長=左センター）表示は切替先 */}
        <button
          class={
            "fixed z-50 " +
            (isLandscape()
              ? "left-1/2 top-2 -translate-x-1/2"
              : "left-2 top-1/2 -translate-y-1/2") +
            " " + btnClass
          }
          onClick={toggleRotateStyle}
        >
          {rotate.style === "crank"
            ? strings.settings.styleToDrag
            : strings.settings.styleToCrank}
        </button>

        {/* 1ふんもどす（横長=下センター, 縦長=右センター）長押しで連続 */}
        <button
          class={
            "fixed z-50 " +
            (isLandscape()
              ? "bottom-2 left-1/2 -translate-x-1/2"
              : "right-2 top-1/2 -translate-y-1/2") +
            " " + btnClass
          }
          style={{ "touch-action": "none" }}
          onPointerDown={startRewind}
          onPointerUp={stopRewind}
          onPointerCancel={stopRewind}
        >
          {strings.settings.rewindMinute}
        </button>
      </Show>

      {/* ===== 通常モードUI（自由回転時は非表示） ===== */}
      <Show when={!rotate.active}>
        {/* 左上: 24h / 12h */}
        <button class={`fixed top-2 left-2 z-50 ${btnClass}`} onClick={toggleTimeFormat}>
          {settings.timeFormat === "24h" ? strings.settings.hour12 : strings.settings.hour24}
        </button>

        {/* 左下: くわしく / すっきり */}
        <button class={`fixed bottom-2 left-2 z-50 ${btnClass}`} onClick={toggleDetailMode}>
          {settings.detailMode === "kuwashiku" ? strings.settings.sukkiri : strings.settings.kuwashiku}
        </button>

        {/* 右下: くぎり / すうじ */}
        <button class={`fixed bottom-2 right-2 z-50 ${btnClass}`} onClick={toggleColorMode}>
          {settings.colorMode === "sector" ? strings.settings.badge : strings.settings.sector}
        </button>

        {/* 次パレット名ボタン: ポートレート=右センター, ランドスケープ=下センター */}
        <button
          class={
            "fixed z-50 " +
            (isLandscape()
              ? "bottom-2 left-1/2 -translate-x-1/2"
              : "right-2 top-1/2 -translate-y-1/2") +
            " " + btnClass
          }
          onClick={cyclePalette}
        >
          {getNextPalette(settings.paletteId).name}
        </button>
      </Show>
    </>
  );
};

export default SettingsPanel;
