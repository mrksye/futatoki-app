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
/** 自由回転の操作スタイル: crank=角度CW限定(てまわし), drag=距離ベース(ぐりぐり) */
export type RotateStyle = "crank" | "drag";
/** 自由回転のサブモード: manual=手動, auto=自動進行 (らんだむは単発アクションなのでここには無い) */
export type RotateMode = "manual" | "auto";

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
  /** サブモード。エントリ時は常に "manual" に初期化 */
  mode: RotateMode;
  /** AM/PMをかさねて1つの時計として表示するか */
  merged: boolean;
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
  setRotateMode: (mode: RotateMode) => void;
  /** 15分刻みのランダム時刻を設定（単発アクション） */
  randomizeRotate: () => void;
  /** AM/PMの重ねモード切替 */
  toggleMerged: () => void;
}

const STORAGE_KEY = "futatoki-settings";

/**
 * らんだむボタンが出す時刻の候補（子どもが起きてる時間帯）。
 * 6:00〜21:00 を 15 分刻みで列挙。出現頻度は 9/11/13/15/17/20時ちょうどが 7倍、
 * その他のちょうどが 4倍、:30 が 2倍、:15/:45 が 1倍。
 */
const RANDOM_AWAKE_TIMES: readonly [number, number][] = [
  [6, 0], [6, 0], [6, 0], [6, 0], [6, 15], [6, 30], [6, 30], [6, 45],
  [7, 0], [7, 0], [7, 0], [7, 0], [7, 15], [7, 30], [7, 30], [7, 45],
  [8, 0], [8, 0], [8, 0], [8, 0], [8, 15], [8, 30], [8, 30], [8, 45],
  [9, 0], [9, 0], [9, 0], [9, 0], [9, 0], [9, 0], [9, 0], [9, 15], [9, 30], [9, 30], [9, 45],
  [10, 0], [10, 0], [10, 0], [10, 0], [10, 15], [10, 30], [10, 30], [10, 45],
  [11, 0], [11, 0], [11, 0], [11, 0], [11, 0], [11, 0], [11, 0], [11, 15], [11, 30], [11, 30], [11, 45],
  [12, 0], [12, 0], [12, 0], [12, 0], [12, 15], [12, 30], [12, 30], [12, 45],
  [13, 0], [13, 0], [13, 0], [13, 0], [13, 0], [13, 0], [13, 0], [13, 15], [13, 30], [13, 30], [13, 45],
  [14, 0], [14, 0], [14, 0], [14, 0], [14, 15], [14, 30], [14, 30], [14, 45],
  [15, 0], [15, 0], [15, 0], [15, 0], [15, 0], [15, 0], [15, 0], [15, 15], [15, 30], [15, 30], [15, 45],
  [16, 0], [16, 0], [16, 0], [16, 0], [16, 15], [16, 30], [16, 30], [16, 45],
  [17, 0], [17, 0], [17, 0], [17, 0], [17, 0], [17, 0], [17, 0], [17, 15], [17, 30], [17, 30], [17, 45],
  [18, 0], [18, 0], [18, 0], [18, 0], [18, 15], [18, 30], [18, 30], [18, 45],
  [19, 0], [19, 0], [19, 0], [19, 0], [19, 15], [19, 30], [19, 30], [19, 45],
  [20, 0], [20, 0], [20, 0], [20, 0], [20, 0], [20, 0], [20, 0], [20, 15], [20, 30], [20, 30], [20, 45],
  [21, 0], [21, 0], [21, 0], [21, 0],
];

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
    mode: "manual",
    merged: false,
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
      // エントリ時は style を drag、mode を manual、merged を true（かさね表示）に初期化
      setRotate({ active: true, minutes: nowAsMinutes(), style: "drag", mode: "manual", merged: true });
    },
    exitRotate() {
      setRotate({ active: false, mode: "manual", merged: true });
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
    setRotateMode(mode) {
      setRotate("mode", mode);
    },
    randomizeRotate() {
      const pick = RANDOM_AWAKE_TIMES[
        Math.floor(Math.random() * RANDOM_AWAKE_TIMES.length)
      ]!;
      setRotate("minutes", pick[0] * 60 + pick[1]);
    },
    toggleMerged() {
      setRotate("merged", !rotate.merged);
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
