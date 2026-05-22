/**
 * robots.txt と sitemap.xml を public/ に生成する pre-build script。
 *
 * 両 file は brand domain (BRAND_CONFIG.domain) を含むため build 時生成にして
 * fork 者は brand.config を書き換えるだけで自動追従する。多言語 sitemap の
 * hreflang 列挙は LP 側 (project_app_lp_responsibility_split) が担当するので
 * app 側 sitemap は root URL 1 件だけに留める。
 */

import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { BRAND_CONFIG } from "../branding/brand.config";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = resolve(__dirname, "..", "public");
const ORIGIN = `https://${BRAND_CONFIG.domain}`;

function buildRobots(): string {
  return `User-agent: *
Allow: /

Sitemap: ${ORIGIN}/sitemap.xml
`;
}

function buildSitemap(): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${ORIGIN}/</loc>
  </url>
</urlset>
`;
}

mkdirSync(PUBLIC_DIR, { recursive: true });
writeFileSync(join(PUBLIC_DIR, "robots.txt"), buildRobots());
writeFileSync(join(PUBLIC_DIR, "sitemap.xml"), buildSitemap());
console.info(`[build-seo-static] wrote robots.txt + sitemap.xml to public/`);
