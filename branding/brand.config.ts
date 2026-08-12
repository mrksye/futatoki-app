/**
 * Structural brand identity (domain, storage namespace, default title, etc.).
 * Locale-specific brand strings (CHARACTER / OFFICIAL / LP / APP / APPLE)
 * live next to this file in branding/brand.ts; visual assets live in this directory too.
 *
 * Cloudflare deploys override `domain` via the ROUTE_DOMAIN env variable
 * (see wrangler.jsonc.template); the value here is the static-build default
 * used by `vite build` and `bun dev`.
 *
 * Forks: edit this file, swap assets in this directory, edit
 * branding/brand.ts (locale strings), and replace root NOTICE / README.md
 * from the templates in branding/NOTICE.example.md and branding/README.example.md.
 */

export interface BrandConfig {
  /** Deploy origin (host only, no protocol, no trailing slash). Drives
   *  canonical URL, og:url, sitemap.xml, robots.txt, JSON-LD `url`. */
  readonly domain: string;

  /** Companion landing-page origin, when the app has a separate marketing
   *  site (e.g. app on play.example.com + LP on example.com). Available to
   *  localized meta descriptions via the {lpDomain} placeholder. Set to
   *  null if the fork has no separate LP. */
  readonly lpDomain: string | null;

  /** localStorage key namespace. Entries are written under
   *  `{storagePrefix}.{key}` and `{storagePrefix}:locale`. */
  readonly storagePrefix: string;

  /** Console diagnostic prefix used by the index.html early-init script
   *  and src/i18n/detect.ts. */
  readonly logPrefix: string;

  /** Display name used as a fallback when a locale has no entry in
   *  CHARACTER_BRAND / APPLE_TITLE. A single Latin word works best. */
  readonly defaultTitle: string;

  /** Hex color used by `<meta name="theme-color">`, PWA manifests, and the
   *  status bar tint on installed PWAs. */
  readonly themeColor: string;

  /** Hex color used as the PWA splash screen background while the app boots. */
  readonly backgroundColor: string;

  /** External author links surfaced in code comments (privacy policy etc.)
   *  and available to localized resources via placeholders. */
  readonly externalLinks: {
    readonly privacy: string;

    /** Public source repository root (no trailing slash). /licenses.html links
     *  its brand-terms note here; set to null if the fork publishes no repo,
     *  and the link is omitted. */
    readonly sourceCode: string | null;
  };
}

export const BRAND_CONFIG: BrandConfig = {
  domain: "play.futatoki.app",
  lpDomain: "futatoki.app",
  storagePrefix: "futatoki",
  logPrefix: "[futatoki-app]",
  defaultTitle: "Futatoki",
  themeColor: "#f8f0e8",
  backgroundColor: "#f8f0e8",
  externalLinks: {
    privacy: "https://futatoki.app/privacy/",
    sourceCode: "https://github.com/mrksye/futatoki-app",
  },
};
