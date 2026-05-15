import { persistedSignal } from "../../lib/persisted-signal";

/**
 * 時計面に出す数字体系。"western" 以外は locale 固有体系。新しい体系を増やすときは
 * NUMERAL_SYSTEM_ZERO (codepoint) と LOCALE_NUMERAL_CONFIG (locale → どの体系を default/
 * alternate に紐付けるか) の両方を更新する。
 *
 * 将来追加候補 (codepoint も同時に NUMERAL_SYSTEM_ZERO へ):
 *   "arabic"   (Arabic-Indic ٠١٢٣٤٥٦٧٨٩, 0x0660) — 現代アラビア圏は文脈次第で western も多用
 *   "persian"  (Extended Arabic-Indic ۰۱۲۳۴۵۶۷۸۹, 0x06F0) — fa/ur
 *   "thai"     (Thai ๐๑๒๓๔๕๖๗๘๙, 0x0E50) — 現代タイの時計は western が default
 */
export type NumeralSystem = "western" | "bengali" | "devanagari";

/** 各数字体系の「0」の Unicode codepoint。null は western (= ASCII 0..9 のまま)。
 *  Unicode の数字ブロックは 0..9 が連続 10 文字なので、ゼロの位置だけ覚えれば桁を生成できる。 */
const NUMERAL_SYSTEM_ZERO: Readonly<Record<NumeralSystem, number | null>> = {
  western: null,
  bengali: 0x09e6,
  devanagari: 0x0966,
};

/** locale ごとの数字体系 config。default = その locale を選んだときの初期表示、alternate =
 *  トグルで切り替わる相手。「ベンガル語は default = bengali、切替で western」「ヒンディーは
 *  default = western、切替で devanagari」のように locale ごとに default の方向が逆になる
 *  ケースを表現できる。ここに無い locale (en/ja/ko/zh/de/fr/...) は western のみで
 *  トグルボタン自体も出ない。 */
type LocaleNumeralConfig = {
  default: NumeralSystem;
  alternate: NumeralSystem;
};

const LOCALE_NUMERAL_CONFIG: Readonly<Record<string, LocaleNumeralConfig>> = {
  bn: { default: "bengali", alternate: "western" },
  // hi: { default: "western", alternate: "devanagari" },
};

/** 整数を指定の数字体系で表記。 */
export function formatBySystem(system: NumeralSystem, n: number): string {
  const zero = NUMERAL_SYSTEM_ZERO[system];
  if (zero === null) return String(n);
  return String(n).replace(/\d/g, (d) => String.fromCharCode(zero + Number(d)));
}

/** ユーザの選択値。null = 未選択 (= 現在 locale の default に従う)。locale 切替を跨いでも
 *  「最後に選んだ system」を保持する設計で、現在 locale で対応してない system が選ばれて
 *  たら resolveNumeralSystem が western に fallback する。 */
const [numeralSystemChoice, setNumeralSystemChoice] =
  persistedSignal<NumeralSystem | null>("numeralSystem", null);

/** 現在 locale で実際に表示すべき数字体系を解決。locale config が無いか、user choice が
 *  現在 locale で未対応なら western に fallback。 */
export function resolveNumeralSystem(localeCode: string): NumeralSystem {
  const config = LOCALE_NUMERAL_CONFIG[localeCode];
  if (!config) return "western";
  const choice = numeralSystemChoice();
  if (choice === null) return config.default;
  if (choice === config.default || choice === config.alternate) return choice;
  return "western";
}

/** トグルで切り替わる「次の」数字体系。toggle ボタンの存在判定 (null なら出さない) と
 *  ボタンラベル (次の体系で "123" を formatBySystem したもの) に使う。 */
export function nextNumeralSystem(localeCode: string): NumeralSystem | null {
  const config = LOCALE_NUMERAL_CONFIG[localeCode];
  if (!config) return null;
  const current = resolveNumeralSystem(localeCode);
  return current === config.default ? config.alternate : config.default;
}

/** 現在 locale の数字体系を default ⇄ alternate でトグル。locale config 無しなら no-op。 */
export function toggleNumeralSystem(localeCode: string): void {
  const next = nextNumeralSystem(localeCode);
  if (next === null) return;
  setNumeralSystemChoice(next);
}
