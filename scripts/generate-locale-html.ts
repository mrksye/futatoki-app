/**
 * dist/index.html (vite build 出力 = ja static) を読み、SUPPORTED_LOCALES の
 * 各 locale 用に og タグ・<title>・<html lang>・canonical・manifest link 等を
 * 置換した HTML を dist/locales/{locale}.html に出力する post-build script。
 *
 * Cloudflare Worker (src/worker/index.ts) が `/?lang=xx` を見て当該ファイルを
 * ASSETS binding 経由で配信する。SNS クローラは JS を実行しないので、OG を
 * locale 別に出すには build 時に静的 HTML として焼いておくのが筋。
 *
 * dist/index.html (ja base) はそのまま残す。Worker を経由しない直接 fetch
 * (古いシェア URL や手動アクセス) のフォールバックに使われる。
 *
 * 翻訳辞書 (src/i18n/resources/{locale}.json) に meta.title / meta.description が
 * 揃っていない locale はスキップする (将来的には全 locale 必須)。
 */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  SUPPORTED_LOCALES,
  DEFAULT_LOCALE,
  SOURCE_LOCALE,
  type LocaleMeta,
} from "../src/i18n/locales";
import { APP_BRAND, OG_LOCALE, APPLE_TITLE } from "../src/i18n/brand";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const DIST = join(ROOT, "dist");
const TEMPLATE_PATH = join(DIST, "index.html");
const OUTPUT_DIR = join(DIST, "locales");
const RESOURCES_DIR = join(ROOT, "src/i18n/resources");
const SITE = "https://play.futatoki.app";

type ResourceJson = {
  meta?: { title?: string; description?: string };
};

const escapeHtmlAttr = (raw: string): string =>
  raw
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

/** hreflang は BCP47 region/script を綺麗に出したい。zh は script タグに寄せる。 */
const hreflangFor = (code: string): string => {
  if (code === "zh-CN") return "zh-Hans";
  if (code === "zh-TW") return "zh-Hant";
  return code;
};

const localeUrl = (code: string): string => `${SITE}/?lang=${code}`;

async function readResource(code: string): Promise<ResourceJson | null> {
  try {
    const text = await readFile(join(RESOURCES_DIR, `${code}.json`), "utf8");
    return JSON.parse(text) as ResourceJson;
  } catch {
    return null;
  }
}

/**
 * <meta ...> 1 行の content="..." を差し替える。selector はマッチさせる
 * 属性パターン (例: 'property="og:title"')。
 */
function replaceMetaContent(
  html: string,
  selector: string,
  newContent: string,
): string {
  const pattern = new RegExp(`(<meta[^>]*${selector}[^>]*)content="[^"]*"`, "i");
  if (!pattern.test(html)) {
    console.warn(`[generate-locale-html] meta not found for selector: ${selector}`);
    return html;
  }
  return html.replace(pattern, `$1content="${escapeHtmlAttr(newContent)}"`);
}

function buildLocaleHtml(template: string, locale: LocaleMeta, res: ResourceJson): string {
  const title = res.meta?.title;
  const description = res.meta?.description;
  if (!title || !description) {
    throw new Error(`meta.title or meta.description missing for ${locale.code}`);
  }

  const siteName = APP_BRAND[locale.code] ?? APP_BRAND[SOURCE_LOCALE];
  const ogLocale = OG_LOCALE[locale.code] ?? OG_LOCALE[SOURCE_LOCALE];
  const appleTitle = APPLE_TITLE[locale.code] ?? "Futatoki";
  const canonicalUrl = localeUrl(locale.code);

  let html = template;

  // <html lang="ja"> → <html lang="xx" [dir="rtl"]>
  const dirAttr = locale.dir === "rtl" ? ' dir="rtl"' : "";
  html = html.replace(
    /<html[^>]*>/,
    `<html lang="${escapeHtmlAttr(locale.code)}"${dirAttr}>`,
  );

  // <title>
  html = html.replace(
    /<title>[^<]*<\/title>/,
    `<title>${escapeHtmlAttr(title)}</title>`,
  );

  // meta tags
  html = replaceMetaContent(html, 'name="description"', description);
  html = replaceMetaContent(html, 'property="og:locale"', ogLocale);
  html = replaceMetaContent(html, 'property="og:site_name"', siteName);
  html = replaceMetaContent(html, 'property="og:title"', title);
  html = replaceMetaContent(html, 'property="og:description"', description);
  html = replaceMetaContent(html, 'property="og:url"', canonicalUrl);
  html = replaceMetaContent(html, 'name="twitter:title"', title);
  html = replaceMetaContent(html, 'name="twitter:description"', description);
  html = replaceMetaContent(html, 'name="apple-mobile-web-app-title"', appleTitle);

  // canonical link
  html = html.replace(
    /<link rel="canonical"[^>]*\/?>/,
    `<link rel="canonical" href="${escapeHtmlAttr(canonicalUrl)}" />`,
  );

  // manifest link (vite-plugin-pwa が injection した /manifest.webmanifest を locale 版へ)
  html = html.replace(
    /<link rel="manifest"[^>]*\/?>/,
    `<link rel="manifest" href="/manifest.${escapeHtmlAttr(locale.code)}.webmanifest" />`,
  );

  // hreflang alternate links を canonical の直後に挿入
  const alternateLinks = SUPPORTED_LOCALES.map(
    (l) =>
      `    <link rel="alternate" hreflang="${escapeHtmlAttr(hreflangFor(l.code))}" href="${escapeHtmlAttr(localeUrl(l.code))}" />`,
  ).join("\n");
  const xDefault = `    <link rel="alternate" hreflang="x-default" href="${escapeHtmlAttr(localeUrl(DEFAULT_LOCALE))}" />`;
  html = html.replace(
    /<link rel="canonical"[^>]*\/?>/,
    (m) => `${m}\n${alternateLinks}\n${xDefault}`,
  );

  return html;
}

async function main() {
  const template = await readFile(TEMPLATE_PATH, "utf8");
  await mkdir(OUTPUT_DIR, { recursive: true });

  const generated: string[] = [];
  const skipped: string[] = [];

  for (const locale of SUPPORTED_LOCALES) {
    const res = await readResource(locale.code);
    if (!res || !res.meta?.title || !res.meta?.description) {
      skipped.push(locale.code);
      continue;
    }
    const html = buildLocaleHtml(template, locale, res);
    await writeFile(join(OUTPUT_DIR, `${locale.code}.html`), html);
    generated.push(locale.code);
  }

  console.log(
    `[generate-locale-html] wrote ${generated.length} locale HTMLs to dist/locales/`,
  );
  console.log(`[generate-locale-html]   generated: ${generated.join(", ")}`);
  if (skipped.length > 0) {
    console.warn(
      `[generate-locale-html]   skipped (missing meta.*): ${skipped.join(", ")}`,
    );
  }
}

main().catch((e) => {
  console.error("[generate-locale-html] failed:", e);
  process.exit(1);
});
