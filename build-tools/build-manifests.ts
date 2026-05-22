/**
 * 全 20 locale の PWA manifest を文字列として生成する pure function。
 *
 * SOURCE OF TRUTH:
 * - 表記値 (name / short_name): branding/brand.ts の OFFICIAL_BRAND / CHARACTER_BRAND
 * - description: src/i18n/resources/{locale}.json の meta.description (formatMetaString で token 展開)
 * - icon path / theme_color / background_color: branding/brand.config.ts
 *
 * vite plugin (brandingAssetsPlugin) が build 時は this.emitFile で dist/ に
 * rollup virtual asset として emit、dev 時は configureServer middleware で
 * in-memory serve する。本 file は file system への書き出しは行わず、
 * pure function として locale → JSON string Map を返すだけ。
 */

import { readFile } from "node:fs/promises";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { SUPPORTED_LOCALES, type LocaleMeta, SOURCE_LOCALE } from "../src/i18n/locales";
import { CHARACTER_BRAND, OFFICIAL_BRAND } from "../branding/brand";
import { BRAND_CONFIG } from "../branding/brand.config";
import { formatMetaString } from "../src/i18n/format-meta";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const RESOURCES_DIR = resolve(ROOT, "src/i18n/resources");

type Manifest = {
  name: string;
  short_name: string;
  description: string;
  lang: string;
  start_url: string;
  scope: string;
  display: string;
  orientation: string;
  theme_color: string;
  background_color: string;
  icons: Array<{ src: string; sizes: string; type: string; purpose?: string }>;
};

function buildManifest(locale: LocaleMeta, descriptionTemplate: string): Manifest {
  return {
    name: OFFICIAL_BRAND[locale.code] ?? OFFICIAL_BRAND[SOURCE_LOCALE],
    short_name: CHARACTER_BRAND[locale.code] ?? CHARACTER_BRAND[SOURCE_LOCALE],
    description: formatMetaString(descriptionTemplate, locale),
    lang: locale.code,
    start_url: `/?lang=${locale.code}`,
    scope: "/",
    display: "standalone",
    orientation: "any",
    theme_color: BRAND_CONFIG.themeColor,
    background_color: BRAND_CONFIG.backgroundColor,
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}

async function loadDescriptionTemplate(code: string): Promise<string | null> {
  try {
    const text = await readFile(join(RESOURCES_DIR, `${code}.json`), "utf8");
    const json = JSON.parse(text) as { meta?: { description?: string } };
    return json.meta?.description ?? null;
  } catch {
    return null;
  }
}

/**
 * 全 SUPPORTED_LOCALES 分の manifest JSON 文字列を locale code → JSON content の
 * Map で返す。meta.description が無い locale は silent skip。呼び出し側 (vite
 * plugin) が build 時 emitFile / dev 時 middleware serve に振り分ける。
 */
export async function buildAllManifests(): Promise<Map<string, string>> {
  const manifests = new Map<string, string>();
  for (const locale of SUPPORTED_LOCALES) {
    const descriptionTemplate = await loadDescriptionTemplate(locale.code);
    if (!descriptionTemplate) continue;
    const manifest = buildManifest(locale, descriptionTemplate);
    manifests.set(locale.code, JSON.stringify(manifest, null, 2) + "\n");
  }
  return manifests;
}
