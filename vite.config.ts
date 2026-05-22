import { defineConfig, type Plugin } from "vite";
import solidPlugin from "vite-plugin-solid";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";
import { copyFileSync, existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { SUPPORTED_LOCALES, SOURCE_LOCALE } from "./src/i18n/locales";

const ROOT_DIR = fileURLToPath(new URL(".", import.meta.url));
const BRANDING_DIR = resolve(ROOT_DIR, "branding");
const DIST_DIR = resolve(ROOT_DIR, "dist");

const BRAND_ASSET_EXTENSIONS = /\.(svg|png|webp|ico)$/;
const BRAND_ASSET_MIME: Record<string, string> = {
  svg: "image/svg+xml",
  png: "image/png",
  webp: "image/webp",
  ico: "image/x-icon",
};

/**
 * branding/ 配下の visual asset (icon, og.png, screenshot.webp 等) を
 * dev 時は middleware で URL ルート相対 (`/icon.svg` 等) で配信し、build 時は
 * dist/ 直下にコピーする。fork 者は branding/icon.svg などを差し替えるだけで
 * 同じ URL path で公開される。
 */
function brandingAssetsPlugin(): Plugin {
  return {
    name: "branding-assets",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (!req.url) return next();
        const pathOnly = req.url.split("?")[0] ?? "";
        const filename = pathOnly.replace(/^\/+/, "");
        if (!BRAND_ASSET_EXTENSIONS.test(filename)) return next();
        const filepath = join(BRANDING_DIR, filename);
        if (!existsSync(filepath) || !statSync(filepath).isFile()) return next();
        const ext = filename.split(".").pop()?.toLowerCase() ?? "";
        res.setHeader(
          "Content-Type",
          BRAND_ASSET_MIME[ext] ?? "application/octet-stream",
        );
        res.end(readFileSync(filepath));
      });
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

// ja 以外の locale chunk を PWA precache から除外する glob。
// locale は src/i18n/resources/*.json を動的 import することで
// 各 locale ごとの chunk (assets/{code}-{hash}.js) に分割されるが、
// デフォルトでは VitePWA がそれらを全部 precache してしまうため
// SW 初回登録時に19言語分を全ダウンロードしてしまう（lazy load の意図と逆）。
// ja は静的 import なので main chunk に同梱されており対象外。
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
      // デフォルト manifest は英語。日本語ブラウザでは index.html の inline JS が
      // /manifest.ja.webmanifest(public/ 配下に手書き)へ link[rel=manifest] を差し替える。
      manifest: {
        name: "Futatoki the Learning Clock App",
        short_name: "Futatoki",
        description: "A kids' educational analog clock app — each hour gets its own color.",
        lang: "en",
        theme_color: "#f8f0e8",
        background_color: "#f8f0e8",
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
