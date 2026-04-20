import { SUPPORTED_LOCALES, DEFAULT_LOCALE } from "./locales";

/**
 * BCP 47 マッチング：
 *   1) 完全一致（"pt-BR" == "pt-BR"）
 *   2) 言語サブタグ一致（"pt-PT" → "pt-BR" を同族として拾う）
 *   3) ヒットなしなら null（呼び出し側で fallback 判断）
 *
 * 備考：スクリプト付き（"zh-Hant-HK" 等）は最初の "-" で切って拾うので
 * "zh-HK" や "zh-Hant-HK" でも "zh-TW" に落ちる。十分な精度とは言えないが
 * CLDR の Likely Subtags まで含めるのは過剰なのでここまでで止める。
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
 * 優先順位：
 *   1) URL ?lang=xx
 *   2) navigator.languages（Accept-Language 相当）の先頭から順にマッチを探す
 *   3) どれも当たらなければ DEFAULT_LOCALE
 */
export function detectLocale(): string {
  if (typeof window !== "undefined") {
    const urlLang = new URLSearchParams(window.location.search).get("lang");
    if (urlLang) {
      const matched = matchLocale(urlLang);
      if (matched) return matched;
    }
  }

  if (typeof navigator !== "undefined") {
    const candidates = navigator.languages?.length
      ? navigator.languages
      : navigator.language
        ? [navigator.language]
        : [];
    for (const cand of candidates) {
      const matched = matchLocale(cand);
      if (matched) return matched;
    }
  }

  return DEFAULT_LOCALE;
}
