import { defineConfig, type Plugin } from "vite";
import solidPlugin from "vite-plugin-solid";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";
import { copyFileSync, existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { SUPPORTED_LOCALES, SOURCE_LOCALE } from "./src/i18n/locales";
import { APP_BRAND, APPLE_TITLE, CHARACTER_BRAND, OFFICIAL_BRAND, OG_LOCALE } from "./branding/brand";
import { BRAND_CONFIG } from "./branding/brand.config";
import { formatMetaString } from "./src/i18n/format-meta";
import { buildAllManifests } from "./build-tools/build-manifests";
import { buildRobotsTxt, buildSitemapXml } from "./build-tools/build-seo-static";

const ROOT_DIR = fileURLToPath(new URL(".", import.meta.url));
const BRANDING_DIR = resolve(ROOT_DIR, "branding");
const DIST_DIR = resolve(ROOT_DIR, "dist");
const RESOURCES_DIR = resolve(ROOT_DIR, "src/i18n/resources");

const BRAND_ASSET_EXTENSIONS = /\.(svg|png|webp|ico)$/;
const BRAND_ASSET_MIME: Record<string, string> = {
  svg: "image/svg+xml",
  png: "image/png",
  webp: "image/webp",
  ico: "image/x-icon",
};

const SOURCE_LOCALE_META = SUPPORTED_LOCALES.find((l) => l.code === SOURCE_LOCALE);
if (!SOURCE_LOCALE_META) {
  throw new Error(`SOURCE_LOCALE "${SOURCE_LOCALE}" not in SUPPORTED_LOCALES`);
}
const FALLBACK_LOCALE_CODE = "en";
const FALLBACK_LOCALE_META =
  SUPPORTED_LOCALES.find((l) => l.code === FALLBACK_LOCALE_CODE) ?? SOURCE_LOCALE_META;

function loadResourceMeta(code: string): { title: string; description: string } {
  const text = readFileSync(join(RESOURCES_DIR, `${code}.json`), "utf8");
  const json = JSON.parse(text) as { meta: { title: string; description: string } };
  return json.meta;
}

const SOURCE_META = loadResourceMeta(SOURCE_LOCALE);
const FALLBACK_META = loadResourceMeta(FALLBACK_LOCALE_META.code);

const SOURCE_META_TITLE = formatMetaString(SOURCE_META.title, SOURCE_LOCALE_META);
const SOURCE_META_DESCRIPTION = formatMetaString(SOURCE_META.description, SOURCE_LOCALE_META);
const FALLBACK_META_DESCRIPTION = formatMetaString(FALLBACK_META.description, FALLBACK_LOCALE_META);

const SOURCE_OG_LOCALE =
  OG_LOCALE[SOURCE_LOCALE] ?? OG_LOCALE[FALLBACK_LOCALE_CODE] ?? "en_US";
const SOURCE_APP_BRAND = APP_BRAND[SOURCE_LOCALE] ?? BRAND_CONFIG.defaultTitle;

const escapeHtmlAttr = (raw: string): string =>
  raw
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

/**
 * branding/ 配下の visual asset (icon, og.png, screenshot.webp 等) と
 * brand-driven 生成物 (manifest 20 個 / robots.txt / sitemap.xml) を扱う
 * 単一 plugin。生成物は file system に永続させず、build 時は this.emitFile で
 * rollup virtual asset として dist/ に直接 emit、dev 時は configureServer
 * middleware で in-memory serve する (public/ には何も書かない)。
 * index.html 内の %BRAND_*% placeholder の build/dev 双方 transform、
 * branding/ 内の visual asset の dev middleware serve + build 時 dist/ copy も
 * 兼ねる。
 */
function brandingAssetsPlugin(): Plugin {
  let manifestCache: Map<string, string> | null = null;
  let robotsCache: string | null = null;
  let sitemapCache: string | null = null;
  let isBuild = false;

  return {
    name: "branding-assets",

    configResolved(config) {
      isBuild = config.command === "build";
    },

    async buildStart() {
      if (!isBuild) return;
      const manifests = await buildAllManifests();
      for (const [locale, json] of manifests) {
        this.emitFile({
          type: "asset",
          fileName: `manifest.${locale}.webmanifest`,
          source: json,
        });
      }
      this.emitFile({
        type: "asset",
        fileName: "robots.txt",
        source: buildRobotsTxt(),
      });
      this.emitFile({
        type: "asset",
        fileName: "sitemap.xml",
        source: buildSitemapXml(),
      });
    },

    async configureServer(server) {
      manifestCache = await buildAllManifests();
      robotsCache = buildRobotsTxt();
      sitemapCache = buildSitemapXml();

      server.middlewares.use((req, res, next) => {
        if (!req.url) return next();
        const pathOnly = req.url.split("?")[0] ?? "";

        const manifestMatch = pathOnly.match(/^\/manifest\.([a-zA-Z-]+)\.webmanifest$/);
        if (manifestMatch && manifestCache) {
          const localeCode = manifestMatch[1];
          if (localeCode) {
            const json = manifestCache.get(localeCode);
            if (json) {
              res.setHeader("Content-Type", "application/manifest+json");
              res.end(json);
              return;
            }
          }
        }

        if (pathOnly === "/robots.txt" && robotsCache) {
          res.setHeader("Content-Type", "text/plain");
          res.end(robotsCache);
          return;
        }

        if (pathOnly === "/sitemap.xml" && sitemapCache) {
          res.setHeader("Content-Type", "application/xml");
          res.end(sitemapCache);
          return;
        }

        const filename = pathOnly.replace(/^\/+/, "");
        if (BRAND_ASSET_EXTENSIONS.test(filename)) {
          const filepath = join(BRANDING_DIR, filename);
          if (existsSync(filepath) && statSync(filepath).isFile()) {
            const ext = filename.split(".").pop()?.toLowerCase() ?? "";
            res.setHeader(
              "Content-Type",
              BRAND_ASSET_MIME[ext] ?? "application/octet-stream",
            );
            res.end(readFileSync(filepath));
            return;
          }
        }

        next();
      });
    },

    transformIndexHtml(html) {
      return html
        .replace(/%BRAND_SOURCE_LOCALE%/g, SOURCE_LOCALE)
        .replace(/%BRAND_THEME_COLOR%/g, BRAND_CONFIG.themeColor)
        .replace(/%BRAND_DEFAULT_TITLE%/g, escapeHtmlAttr(BRAND_CONFIG.defaultTitle))
        .replace(/%BRAND_DOMAIN%/g, BRAND_CONFIG.domain)
        .replace(/%BRAND_LOG_PREFIX%/g, BRAND_CONFIG.logPrefix)
        .replace(/%BRAND_STORAGE_PREFIX%/g, BRAND_CONFIG.storagePrefix)
        .replace(
          /%BRAND_SUPPORTED_LOCALES_JSON%/g,
          JSON.stringify(SUPPORTED_LOCALES.map((l) => l.code)),
        )
        .replace(/%BRAND_APPLE_TITLE_JSON%/g, JSON.stringify(APPLE_TITLE))
        .replace(/%BRAND_SOURCE_META_TITLE%/g, escapeHtmlAttr(SOURCE_META_TITLE))
        .replace(/%BRAND_SOURCE_META_DESCRIPTION%/g, escapeHtmlAttr(SOURCE_META_DESCRIPTION))
        .replace(/%BRAND_SOURCE_OG_LOCALE%/g, SOURCE_OG_LOCALE)
        .replace(/%BRAND_SOURCE_APP_BRAND%/g, escapeHtmlAttr(SOURCE_APP_BRAND));
    },

    closeBundle() {
      if (!existsSync(BRANDING_DIR) || !existsSync(DIST_DIR)) return;
      for (const file of readdirSync(BRANDING_DIR)) {
        if (!BRAND_ASSET_EXTENSIONS.test(file)) continue;
        const src = join(BRANDING_DIR, file);
        if (!statSync(src).isFile()) continue;
        copyFileSync(src, join(DIST_DIR, file));
      }
    },
  };
}

// SOURCE 以外の locale chunk を PWA precache から除外する glob。
// locale は src/i18n/resources/*.json を動的 import することで
// 各 locale ごとの chunk (assets/{code}-{hash}.js) に分割されるが、
// デフォルトでは VitePWA がそれらを全部 precache してしまうため
// SW 初回登録時に19言語分を全ダウンロードしてしまう（lazy load の意図と逆）。
// SOURCE_LOCALE は静的 import なので main chunk に同梱されており対象外。
const nonSourceLocaleChunkIgnores = SUPPORTED_LOCALES
  .filter((l) => l.code !== SOURCE_LOCALE)
  .map((l) => `assets/${l.code}-*.js`);

export default defineConfig({
  plugins: [
    brandingAssetsPlugin(),
    solidPlugin(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      workbox: {
        globIgnores: nonSourceLocaleChunkIgnores,
      },
      // デフォルト manifest は FALLBACK_LOCALE (en)。SOURCE_LOCALE ブラウザでは index.html
      // の inline JS が /manifest.{locale}.webmanifest へ link[rel=manifest] を差し替える。
      manifest: {
        name: OFFICIAL_BRAND[FALLBACK_LOCALE_META.code] ?? OFFICIAL_BRAND[SOURCE_LOCALE],
        short_name: CHARACTER_BRAND[FALLBACK_LOCALE_META.code] ?? BRAND_CONFIG.defaultTitle,
        description: FALLBACK_META_DESCRIPTION,
        lang: FALLBACK_LOCALE_META.code,
        theme_color: BRAND_CONFIG.themeColor,
        background_color: BRAND_CONFIG.backgroundColor,
        display: "standalone",
        orientation: "any",
        icons: [
          { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
    }),
  ],
  server: {
    port: 5173,
    strictPort: true,
  },
  build: {
    target: "esnext",
  },
});
