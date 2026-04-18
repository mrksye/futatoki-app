import type { Component } from "solid-js";
import { useSettings } from "../store/settings";
import { getNextPalette } from "../colors";
import { useOrientation } from "../hooks/useOrientation";

const SettingsPanel: Component = () => {
  const { settings, setColorMode, setTimeFormat, setDetailMode, cyclePalette } = useSettings();
  const isLandscape = useOrientation();

  const toggleColorMode = () =>
    setColorMode(settings.colorMode === "sector" ? "badge" : "sector");

  const toggleTimeFormat = () =>
    setTimeFormat(settings.timeFormat === "24h" ? "12h" : "24h");

  const toggleDetailMode = () =>
    setDetailMode(settings.detailMode === "kuwashiku" ? "sukkiri" : "kuwashiku");

  const btnClass = "px-3 py-1.5 rounded-full text-[11px] font-bold shadow-md active:scale-90 transition-all bg-white/80 backdrop-blur-sm text-gray-700";

  return (
    <>
      {/* 左上: 24h / 12h */}
      <button
        class={`fixed top-2 left-2 z-50 ${btnClass}`}
        onClick={toggleTimeFormat}
      >
        {settings.timeFormat === "24h" ? "12h" : "24h"}
      </button>

      {/* 右上: てまわし（将来用） */}
      <button
        class={`fixed top-2 right-2 z-50 ${btnClass} opacity-50`}
        onClick={() => {/* 将来実装 */}}
      >
        てまわし
      </button>

      {/* 左下: くわしく / すっきり */}
      <button
        class={`fixed bottom-2 left-2 z-50 ${btnClass}`}
        onClick={toggleDetailMode}
      >
        {settings.detailMode === "kuwashiku" ? "すっきり" : "くわしく"}
      </button>

      {/* 右下: くぎり / すうじ */}
      <button
        class={`fixed bottom-2 right-2 z-50 ${btnClass}`}
        onClick={toggleColorMode}
      >
        {settings.colorMode === "sector" ? "すうじ" : "くぎり"}
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
    </>
  );
};

export default SettingsPanel;
