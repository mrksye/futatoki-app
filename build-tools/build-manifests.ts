/**
 * 全 20 locale の PWA manifest を public/manifest.{locale}.webmanifest として
 * 生成する pre-build script。
 *
 * SOURCE OF TRUTH:
 * - 表記値 (name / short_name): branding/brand.ts の OFFICIAL_BRAND / CHARACTER_BRAND
 * - description: src/i18n/resources/{locale}.json の meta.description (token 展開後)
 * - icon path / theme_color / background_color: branding/brand.config.ts
 *
 * vite build より先に走らせ、public/ 配下に書き出した内容を vite が dist/ にコピー
 * する流れ。生成物自体は .gitignore で tracked から外し CI でも build 時に再生成。
 */

import { writeFileSync, mkdirSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { SUPPORTED_LOCALES, type LocaleMeta, SOURCE_LOCALE } from "../src/i18n/locales";
import { CHARACTER_BRAND, OFFICIAL_BRAND } from "../branding/brand";
import { BRAND_CONFIG } from "../branding/brand.config";
import { formatMetaString } from "../src/i18n/format-meta";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const PUBLIC_DIR = resolve(ROOT, "public");
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

export async function buildManifests(): Promise<void> {
  mkdirSync(PUBLIC_DIR, { recursive: true });
  let written = 0;
  const skipped: string[] = [];
  for (const locale of SUPPORTED_LOCALES) {
    const descriptionTemplate = await loadDescriptionTemplate(locale.code);
    if (!descriptionTemplate) {
      skipped.push(locale.code);
      continue;
    }
    const manifest = buildManifest(locale, descriptionTemplate);
    writeFileSync(
      join(PUBLIC_DIR, `manifest.${locale.code}.webmanifest`),
      JSON.stringify(manifest, null, 2) + "\n",
    );
    written++;
  }
  console.info(`[build-manifests] wrote ${written} manifests to public/`);
  if (skipped.length > 0) {
    console.warn(`[build-manifests] skipped (missing meta.description): ${skipped.join(", ")}`);
  }
}

if (import.meta.main) {
  buildManifests().catch((e) => {
    console.error("[build-manifests] failed:", e);
    process.exit(1);
  });
}
