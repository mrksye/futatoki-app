import { createSignal, type Signal, type Setter } from "solid-js";

/**
 * localStorage 永続化付き createSignal。
 *
 * 各 setting が自分の key (`futatoki.<key>`) を持つ。setter 経由の書き換え時に
 * 自動で localStorage に JSON で保存。読み込み失敗 (パース不可・private mode 等) は
 * silent に initial にフォールバックする。
 *
 * 使い方:
 *   const [colorMode, setColorMode] = persistedSignal<ColorMode>("colorMode", "sector");
 */
export function persistedSignal<T>(key: string, initial: T): Signal<T> {
  const storageKey = `futatoki.${key}`;

  let loaded = initial;
  try {
    const raw = localStorage.getItem(storageKey);
    if (raw !== null) loaded = JSON.parse(raw) as T;
  } catch {
    // ignore — corrupt JSON or unavailable storage falls back to initial
  }

  const [value, setRaw] = createSignal<T>(loaded);

  const set = ((arg) => {
    const next = (setRaw as (a: typeof arg) => T)(arg);
    try {
      localStorage.setItem(storageKey, JSON.stringify(next));
    } catch {
      // ignore — quota exceeded / private mode
    }
    return next;
  }) as Setter<T>;

  return [value, set];
}
