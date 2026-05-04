import type { LocaleMeta } from "./locales";
import { APP_BRAND, APPLE_TITLE, OG_LOCALE } from "./brand";

const SOURCE = "ja";

const setMetaContent = (selector: string, content: string) => {
  const element = document.querySelector(`meta[${selector}]`);
  if (element) element.setAttribute("content", content);
};

/**
 * locale 切替時に <head> 内 metadata を runtime 書換える。
 *
 * クローラ向けには index.html の ja static がそのまま読まれ、JS 実行できる UA は
 * 各 locale の値で上書きされる。meta.title / meta.description は resources の
 * 翻訳テキスト、og:site_name や apple-mobile-web-app-title はブランドルール
 * (brand.ts) から決定する。
 *
 * 翻訳未整備の locale (meta.title/description が無い) では何もせず、static ja を
 * 残す方針。段階 4 で全 locale 揃えると全 locale で apply 走る。
 */
export function applyDocumentMetadata(
  locale: LocaleMeta,
  dict: Record<string, string>,
) {
  if (typeof document === "undefined") return;

  const title = dict["meta.title"];
  const description = dict["meta.description"];
  if (!title || !description) return;

  const siteName = APP_BRAND[locale.code] ?? APP_BRAND[SOURCE];
  const appleTitle = APPLE_TITLE[locale.code] ?? APPLE_TITLE[SOURCE];
  const ogLocale = OG_LOCALE[locale.code] ?? OG_LOCALE[SOURCE];

  document.title = title;
  setMetaContent('name="description"', description);
  setMetaContent('property="og:title"', title);
  setMetaContent('property="og:description"', description);
  setMetaContent('property="og:site_name"', siteName);
  setMetaContent('property="og:locale"', ogLocale);
  setMetaContent('name="twitter:title"', title);
  setMetaContent('name="twitter:description"', description);
  setMetaContent('name="apple-mobile-web-app-title"', appleTitle);

  const manifestLink = document.querySelector('link[rel="manifest"]');
  if (manifestLink) {
    manifestLink.setAttribute("href", `/manifest.${locale.code}.webmanifest`);
  }
}
