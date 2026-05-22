/**
 * robots.txt と sitemap.xml の content を文字列として生成する pure function。
 *
 * 両 file は brand domain (BRAND_CONFIG.domain) を含むため build 時生成にして
 * fork 者は brand.config を書き換えるだけで自動追従する。多言語 sitemap の
 * hreflang 列挙は LP 側担当 (project_app_lp_responsibility_split) なので
 * app 側 sitemap は root URL 1 件だけに留める。
 *
 * vite plugin (brandingAssetsPlugin) が build 時は this.emitFile で dist/ に
 * rollup virtual asset として emit、dev 時は configureServer middleware で
 * in-memory serve する。本 file は file system への書き出しは行わない。
 */

import { BRAND_CONFIG } from "../branding/brand.config";

const ORIGIN = `https://${BRAND_CONFIG.domain}`;

export function buildRobotsTxt(): string {
  return `User-agent: *
Allow: /

Sitemap: ${ORIGIN}/sitemap.xml
`;
}

export function buildSitemapXml(): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${ORIGIN}/</loc>
  </url>
</urlset>
`;
}
