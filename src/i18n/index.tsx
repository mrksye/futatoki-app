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
import { SUPPORTED_LOCALES, DEFAULT_LOCALE, SOURCE_LOCALE, type LocaleMeta } from "./locales";
import { detectLocale } from "./detect";
import { applyDocumentMetadata } from "./document-metadata";
import { applyJsonLd } from "./json-ld";
import {
  formatBySystem,
  resolveNumeralSystem,
} from "../features/settings/numeral-system";
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

  /** placeholder は `{name}` のみ (現状 dict は `{n}` の単一形のみ使用)。ICU の plural/select/
   *  number 等は使わないので intl-messageformat の依存を抜いて素朴な正規表現置換に置換。
   *  未定義キーは `{key}` のまま残して翻訳漏れに気付ける形にする。 */
  const interpolate = (
    template: string,
    values?: Record<string, unknown>,
  ): string => {
    if (!values) return template;
    return template.replace(/\{(\w+)\}/g, (_, k) =>
      k in values ? String(values[k]) : `{${k}}`,
    );
  };

  const translate = i18n.translator(() => dict() ?? {}, interpolate);

  const t: I18nContextValue["t"] = (key, values) =>
    (translate(key as never, values as never) as string | undefined) ?? key;

  const formatNumeral: I18nContextValue["formatNumeral"] = (n) =>
    formatBySystem(resolveNumeralSystem(meta.code), n);

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
