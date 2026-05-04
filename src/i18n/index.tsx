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

  createEffect(() => {
    const resolved = dict();
    if (resolved) applyDocumentMetadata(meta, resolved);
  });

  return (
    <I18nContext.Provider value={{ locale: () => meta, t }}>
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
