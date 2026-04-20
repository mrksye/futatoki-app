import { defineConfig } from "vite";
import solidPlugin from "vite-plugin-solid";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";
import { SUPPORTED_LOCALES, SOURCE_LOCALE } from "./src/i18n/locales";

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
    solidPlugin(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      workbox: {
        globIgnores: nonSourceLocaleChunkIgnores,
      },
      manifest: {
        name: "EduClock - 知育時計",
        short_name: "EduClock",
        description: "子ども向け知育アナログ時計アプリ",
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
