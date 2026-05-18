import { persistedSignal } from "../../lib/persisted-signal";

/**
 * "NothingDigitsFont" — 時数 (hour numerals 1-12) の出力を空文字に潰す二段目フォント変換。
 * 一段目で formatNumeral が locale 数字体系 (western/bengali/devanagari) を当てた文字列を、
 * この関数でもっかい包んで「描画上消す」だけのレイヤー。包む箇所を時数の `<text>` 1 か所に
 * 限定するので分計 (minute markers) や aria-label は無傷。NumeralSystem を増やす方針だと
 * formatNumeral 経由の call site 全部に影響するのを避けるため、数字体系とは直交した独立
 * signal で管理する。
 */
const [hidden, setHidden] = persistedSignal<boolean>("hourNumeralsHidden", false);

export const hourNumeralsHidden = hidden;
export const setHourNumeralsHidden = setHidden;

/** 時数描画用に formatNumeral の出力をもっかい挟むフォント変換。hourNumeralsHidden() が
 *  true のとき入力を捨てて空文字を返す。signal を読むので reactive コンテキストから呼ぶこと。 */
export const applyNothingDigitsFont = (s: string): string => (hidden() ? "" : s);
