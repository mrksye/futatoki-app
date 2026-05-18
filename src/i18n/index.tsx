import {
  createContext,
  createEffect,
  createResource,
  useContext,
  Show,
  type Accessor,
  type JSX,
} from "solid-js";
import * as i18n from "@solid-primitives/i18n";
import IntlMessageFormat from "intl-messageformat";
import { SUPPORTED_LOCALES, DEFAULT_LOCALE, SOURCE_LOCALE, type LocaleMeta } from "./locales";
import { detectLocale } from "./detect";
import { applyDocumentMetadata } from "./document-metadata";
import { applyJsonLd } from "./json-ld";
import {
  defaultNumeralSystem,
  formatBySystem,
  nextNumeralSystem,
  resetNumeralSystemChoice,
  resolveNumeralSystem,
  toggleNumeralSystem as toggleNumeralSystemFor,
} from "../features/settings/numeral-system";
import {
  hourNumeralsHidden,
  setHourNumeralsHidden,
} from "../features/settings/nothing-digits-font";
import jaDict from "./resources/ja.json";

export type Dict = typeof jaDict;

type Flatten<T, P extends string = ""> = {
  [K in keyof T & string]: T[K] extends object
    ? Flatten<T[K], `${P}${K}.`>
    : `${P}${K}`;
}[keyof T & string];

export type TKey = Flatten<Dict>;

/**
 * ja 以外の各 locale の JSON を動的 import。Vite が言語ごとに chunk 分割するので
 * 初期バンドルには選ばれた言語のみが載る。ja は source として静的参照しているので
 * 常に main chunk に含まれる。`import.meta.glob` の exclude パターンで ja を明示的に
 * 除外し、static と dynamic の二重 import を回避する。
 */
const LOCALE_MODULES = import.meta.glob<Dict>(
  ["./resources/*.json", "!./resources/ja.json"],
  { import: "default" },
);

const LOADERS: Record<string, () => Promise<Dict>> = Object.fromEntries(
  Object.entries(LOCALE_MODULES).map(([path, loader]) => {
    const code = path.replace(/^.*\/([^/]+)\.json$/, "$1");
    return [code, loader];
  }),
);

type I18nContextValue = {
  locale: Accessor<LocaleMeta>;
  t: (key: TKey, values?: Record<string, unknown>) => string;
  /** 整数を「現在 locale × user 選択」で解決された数字体系で表記。numeral-system feature の
   *  signal を読むので reactive コンテキストから呼ぶこと。時数を消す NothingDigitsFont は
   *  ここでは適用しない — 時数描画 site で applyNothingDigitsFont を一段挟む役割分担。 */
  formatNumeral: (n: number) => string;
  /** トグルボタンの「次タップ後の状態」の preview。常に文字列を返す (全 locale でボタン常時表示)。
   *  次が表示状態なら次体系の "123" / "১২৩"、次が「時数を隠す」状態なら現体系の "123" に
   *  combining stroke を被せた "1̶2̶3̶" を返して「タップで消える未来」を視覚化。 */
  numeralTogglePreview: () => string;
  /** 「数字体系 × 時数の隠蔽」2 軸を 1 本の cycle に畳んだトグル。
   *  - 一般 locale: (western 表示) → (隠す) → loop
   *  - bn: (bengali 表示) → (western 表示) → (隠す) → loop
   *  隠す解除時は locale default に必ず戻す。 */
  toggleNumeralSystem: () => void;
};

const I18nContext = createContext<I18nContextValue>();

export function I18nProvider(props: { children: JSX.Element }) {
  const code = detectLocale();
  const meta =
    SUPPORTED_LOCALES.find((l) => l.code === code) ??
    SUPPORTED_LOCALES.find((l) => l.code === DEFAULT_LOCALE)!;

  if (typeof document !== "undefined") {
    document.documentElement.lang = meta.code;
    document.documentElement.dir = meta.dir;
  }

  const [dict] = createResource(async () => {
    const resource =
      meta.code === SOURCE_LOCALE
        ? jaDict
        : ((await LOADERS[meta.code]?.()) ?? jaDict);
    return i18n.flatten(resource) as unknown as Record<string, string>;
  });

  /** ICU MessageFormat の実体生成は重いのでテンプレ毎にキャッシュ。 */
  const mfCache = new Map<string, IntlMessageFormat>();
  const getFormatter = (template: string): IntlMessageFormat => {
    let mf = mfCache.get(template);
    if (!mf) {
      mf = new IntlMessageFormat(template, meta.code);
      mfCache.set(template, mf);
    }
    return mf;
  };

  const translate = i18n.translator(
    () => dict() ?? {},
    (template: string, values?: Record<string, unknown>) => {
      if (!values) return template;
      return getFormatter(template).format(values) as string;
    },
  );

  const t: I18nContextValue["t"] = (key, values) =>
    (translate(key as never, values as never) as string | undefined) ?? key;

  const formatNumeral: I18nContextValue["formatNumeral"] = (n) =>
    formatBySystem(resolveNumeralSystem(meta.code), n);

  /** combining stroke overlay (U+0336) を各 grapheme の後ろに挟んで「タップで消える未来」を描く。
   *  bengali/devanagari の合成文字でも 1 codepoint 単位で被さる (時計面に出すのは桁の連なりだけで
   *  ligature が要らない数字なので Array.from の分割で十分)。font fallback によっては stroke の
   *  長さがブレるが視認性は十分。 */
  const strikethrough = (s: string): string =>
    Array.from(s).map((ch) => ch + "̶").join("");

  /** cycle 上「次に locale 数字体系を切替えるべき位置」にいるかを判定。
   *  hasAlternate (= LOCALE_NUMERAL_CONFIG に登録あり) かつ現在が default 位置のときだけ true。
   *  bn @ bengali → true (次は western)、bn @ western → false (次は「隠す」)、en → false。 */
  const canStepLocaleSystem = (): boolean => {
    if (nextNumeralSystem(meta.code) === null) return false;
    return resolveNumeralSystem(meta.code) === defaultNumeralSystem(meta.code);
  };

  const numeralTogglePreview: I18nContextValue["numeralTogglePreview"] = () => {
    if (hourNumeralsHidden()) {
      // 次は「隠す解除」= locale default 表示へ戻る
      return formatBySystem(defaultNumeralSystem(meta.code), 123);
    }
    if (canStepLocaleSystem()) {
      // 次は alternate 体系 (= bn の western)
      return formatBySystem(nextNumeralSystem(meta.code)!, 123);
    }
    // 次は「隠す」= 現体系の 123 を斜線打ち消し
    return strikethrough(formatBySystem(resolveNumeralSystem(meta.code), 123));
  };

  const toggleNumeralSystem = () => {
    if (hourNumeralsHidden()) {
      // (隠す) → loop 先頭: locale default にリセットして表示再開
      setHourNumeralsHidden(false);
      resetNumeralSystemChoice();
      return;
    }
    if (canStepLocaleSystem()) {
      // (default 表示) → (alternate 表示): bn の bengali → western
      toggleNumeralSystemFor(meta.code);
      return;
    }
    // (最後の表示状態) → (隠す)
    setHourNumeralsHidden(true);
  };

  createEffect(() => {
    const resolved = dict();
    if (!resolved) return;
    applyDocumentMetadata(meta, resolved);
    applyJsonLd(meta, resolved);
  });

  return (
    <I18nContext.Provider
      value={{
        locale: () => meta,
        t,
        formatNumeral,
        numeralTogglePreview,
        toggleNumeralSystem,
      }}
    >
      <Show when={dict()} fallback={null}>
        {props.children}
      </Show>
    </I18nContext.Provider>
  );
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used within <I18nProvider>");
  return ctx;
}
