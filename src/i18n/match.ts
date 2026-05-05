/**
 * BCP 47 マッチング & Accept-Language 解析の pure 関数群。
 *
 * ブラウザ (detect.ts) と Cloudflare Worker (src/worker/index.ts) の双方から
 * 利用するため、window / navigator / document など runtime 依存を一切持たない。
 */

import { SUPPORTED_LOCALES } from "./locales";

/**
 * 完全一致 → 言語サブタグ一致 → null。
 * スクリプト付き ("zh-Hant-HK" 等) は最初の "-" で切るので "zh-HK" や
 * "zh-Hant-HK" は "zh-TW" に落ちる。CLDR Likely Subtags まで含めるのは過剰。
 */
export function matchLocale(requested: string): string | null {
  if (!requested) return null;
  const req = requested.replace(/_/g, "-");

  const exact = SUPPORTED_LOCALES.find(
    (l) => l.code.toLowerCase() === req.toLowerCase(),
  );
  if (exact) return exact.code;

  const lang = req.split("-")[0]?.toLowerCase();
  if (!lang) return null;

  const sameCode = SUPPORTED_LOCALES.find(
    (l) => l.code.toLowerCase() === lang,
  );
  if (sameCode) return sameCode.code;

  const sameFamily = SUPPORTED_LOCALES.find((l) =>
    l.code.toLowerCase().startsWith(lang + "-"),
  );
  if (sameFamily) return sameFamily.code;

  return null;
}

/**
 * Accept-Language ヘッダ ("ja,en-US;q=0.8,en;q=0.7") を q-value 降順で解析し、
 * 最初に matchLocale で当たった supported locale code を返す。マッチが無ければ null。
 *
 * RFC 7231: q が省略された entry は q=1.0 扱い。同 q なら入力順を維持する。
 */
export function matchAcceptLanguage(header: string | null): string | null {
  if (!header) return null;

  const entries = header
    .split(",")
    .map((raw, index) => {
      const [tag, ...params] = raw.trim().split(";");
      let q = 1;
      for (const p of params) {
        const m = p.trim().match(/^q=([0-9.]+)$/i);
        const captured = m?.[1];
        if (captured !== undefined) {
          const parsed = Number.parseFloat(captured);
          if (Number.isFinite(parsed)) q = parsed;
        }
      }
      return { tag: tag?.trim() ?? "", q, index };
    })
    .filter((e) => e.tag.length > 0 && e.tag !== "*")
    .sort((a, b) => (b.q - a.q) || (a.index - b.index));

  for (const { tag } of entries) {
    const matched = matchLocale(tag);
    if (matched) return matched;
  }
  return null;
}
