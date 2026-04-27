import { createSignal, type Signal, type Setter } from "solid-js";

/**
 * localStorage 永続化付き createSignal。各 setting が自分の key (`futatoki.<key>`) を持ち、setter 経由の
 * 書き換え時に JSON で自動保存される。読み込み失敗 (パース不可・private mode 等) は silent に initial へ
 * フォールバック。
 */
export function persistedSignal<T>(key: string, initial: T): Signal<T> {
  const storageKey = `futatoki.${key}`;

  let loaded = initial;
  try {
    const raw = localStorage.getItem(storageKey);
    if (raw !== null) loaded = JSON.parse(raw) as T;
  } catch (e) {
    try { console.warn(`[persistedSignal] ${storageKey} read failed:`, e); } catch (_) {}
  }

  const [value, setRaw] = createSignal<T>(loaded);

  const set = ((arg) => {
    const next = (setRaw as (a: typeof arg) => T)(arg);
    try {
      localStorage.setItem(storageKey, JSON.stringify(next));
    } catch (e) {
      try { console.warn(`[persistedSignal] ${storageKey} write failed:`, e); } catch (_) {}
    }
    return next;
  }) as Setter<T>;

  return [value, set];
}
