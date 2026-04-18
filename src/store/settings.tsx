import {
  createContext,
  useContext,
  type ParentComponent,
} from "solid-js";
import { createStore } from "solid-js/store";
import { DEFAULT_PALETTE_ID, getPalette, palettes } from "../colors";

export type ColorMode = "sector" | "badge";
export type TimeFormat = "24h" | "12h";
export type DetailMode = "kuwashiku" | "sukkiri";
/** 自由回転の操作スタイル: crank=角度CW限定(てまわし), drag=距離ベース(どらっぐ) */
export type RotateStyle = "crank" | "drag";

export interface Settings {
  colorMode: ColorMode;
  timeFormat: TimeFormat;
  /** くわしく=外周に1-60の分表示, すっきり=非表示 */
  detailMode: DetailMode;
  paletteId: string;
}

export interface RotateState {
  /** じゆうかいてんモードON/OFF */
  active: boolean;
  /** 表示中の分（0-1439） */
  minutes: number;
  /** 操作スタイル。エントリ時は常に "drag" に初期化（セッション内のみ有効） */
  style: RotateStyle;
}

interface SettingsContextValue {
  settings: Settings;
  setColorMode: (mode: ColorMode) => void;
  setTimeFormat: (format: TimeFormat) => void;
  setDetailMode: (mode: DetailMode) => void;
  setPaletteId: (id: string) => void;
  cyclePalette: () => void;

  rotate: RotateState;
  enterRotate: () => void;
  exitRotate: () => void;
  resetRotate: () => void;
  setRotateMinutes: (m: number) => void;
  toggleRotateStyle: () => void;
}

const STORAGE_KEY = "educlock-settings";

const defaultSettings: Settings = {
  colorMode: "sector",
  timeFormat: "24h",
  detailMode: "kuwashiku",
  paletteId: DEFAULT_PALETTE_ID,
};

function loadSettings(): Settings {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const merged: Settings = { ...defaultSettings, ...JSON.parse(stored) };
      // 保存されたpaletteIdが現存しない場合はデフォルトに戻す
      if (!palettes.some((p) => p.id === merged.paletteId)) {
        merged.paletteId = DEFAULT_PALETTE_ID;
      }
      return merged;
    }
  } catch {
    // ignore
  }
  return { ...defaultSettings };
}

function saveSettings(settings: Settings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // ignore
  }
}

function nowAsMinutes(): number {
  const d = new Date();
  return d.getHours() * 60 + d.getMinutes();
}

const SettingsContext = createContext<SettingsContextValue>();

export const SettingsProvider: ParentComponent = (props) => {
  const [settings, setSettings] = createStore<Settings>(loadSettings());
  const [rotate, setRotate] = createStore<RotateState>({
    active: false,
    minutes: nowAsMinutes(),
    style: "drag",
  });

  const value: SettingsContextValue = {
    get settings() {
      return settings;
    },
    setColorMode(mode) {
      setSettings("colorMode", mode);
      saveSettings({ ...settings, colorMode: mode });
    },
    setTimeFormat(format) {
      setSettings("timeFormat", format);
      saveSettings({ ...settings, timeFormat: format });
    },
    setDetailMode(mode) {
      setSettings("detailMode", mode);
      saveSettings({ ...settings, detailMode: mode });
    },
    setPaletteId(id) {
      const target = getPalette(id).id; // 存在しないIDはデフォルトに正規化
      setSettings("paletteId", target);
      saveSettings({ ...settings, paletteId: target });
    },
    cyclePalette() {
      const idx = palettes.findIndex((p) => p.id === settings.paletteId);
      const next = palettes[(idx + 1) % palettes.length]!.id;
      setSettings("paletteId", next);
      saveSettings({ ...settings, paletteId: next });
    },

    get rotate() {
      return rotate;
    },
    enterRotate() {
      // エントリ時は style を drag にリセット
      setRotate({ active: true, minutes: nowAsMinutes(), style: "drag" });
    },
    exitRotate() {
      setRotate("active", false);
    },
    resetRotate() {
      setRotate("minutes", nowAsMinutes());
    },
    setRotateMinutes(m) {
      const wrapped = ((m % 1440) + 1440) % 1440;
      setRotate("minutes", wrapped);
    },
    toggleRotateStyle() {
      setRotate("style", rotate.style === "crank" ? "drag" : "crank");
    },
  };

  return (
    <SettingsContext.Provider value={value}>
      {props.children}
    </SettingsContext.Provider>
  );
};

export function useSettings(): SettingsContextValue {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error("useSettings must be used within SettingsProvider");
  return ctx;
}
