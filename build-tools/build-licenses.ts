/**
 * /licenses.html の content を文字列として生成する pure function。
 *
 * このアプリが配布する成果物 (JS bundle / service worker / CSS / self-host font)
 * に他者の著作物が含まれる以上、その著作権表示とライセンス本文を受け取り手が
 * 辿れる場所に置く義務がある (MIT の "shall be included in all copies" /
 * OFL の "must be distributed with the copy of the font")。root の LICENSE と
 * NOTICE は fork 者と GitHub 訪問者向けで、アプリの利用者は普通そこまで見に
 * 行かないため、アプリ画面 (設定パネル最下部) から 1 タップで開ける HTML を
 * 同一 origin に置く。self-host font と同じく外部に飛ばさない方針なので、
 * この page も外部リソースを一切参照しない (CSS は inline)。
 *
 * 自プロジェクト分の本文は root の LICENSE を build 時に読んでそのまま埋める。
 * ここに copy を持つと year / holder が drift するし、fork 者が LICENSE を
 * 差し替えた瞬間に page も追従してほしいため。第三者分の MIT 本文だけは
 * holder 行を差し替えて描くテンプレートを本 file に持つ (原文が holder 行以外
 * 完全に同一なので、entry ごとに全文を並べず 1 回だけ出す)。
 *
 * BUNDLED_* テーブルの更新タイミング: dependencies を足す / 外すときに、その
 * 成果物がブラウザに配られるか (= dist/ に載るか) で判断して増減させる。
 * build 時にしか動かない devDependency (wrangler / TypeScript 等) は配布物に
 * 含まれないので載せない。
 *
 * vite plugin (brandingAssetsPlugin) が build 時は this.emitFile で dist/ に
 * emit、dev 時は configureServer middleware で in-memory serve する。本 file は
 * file system への書き出しは行わない (build-seo-static.ts と同機構)。
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { BRAND_CONFIG } from "../branding/brand.config";
import { OFFICIAL_BRAND } from "../branding/brand";

const ROOT_DIR = fileURLToPath(new URL("..", import.meta.url));

/** page は英語単一。ライセンス本文が英語原文でしか法的に成立せず、訳を併記すると
 *  どちらが正文か曖昧になるため、20 locale 展開の対象外とする。 */
const PAGE_LOCALE = "en";

interface BundledWork {
  /** 表示名。原著者の呼称をそのまま使う。 */
  name: string;
  /** 著作権表示。各 package の LICENSE から一字一句そのまま写す。 */
  copyright: string;
  /** 何としてこのアプリに載っているか (受け取り手が「なぜこれが要るのか」を辿れるように)。 */
  role: string;
  /** 原典 URL。 */
  url: string;
}

/** MIT license のもとで配布物に含まれる第三者ソフトウェア。 */
const BUNDLED_MIT_WORKS: readonly BundledWork[] = [
  {
    name: "SolidJS",
    copyright: "Copyright (c) 2016-2025 Ryan Carniato",
    role: "UI runtime; compiled into the app bundle",
    url: "https://github.com/solidjs/solid",
  },
  {
    name: "@solid-primitives/i18n",
    copyright: "Copyright (c) 2021 Solid Primitives Working Group",
    role: "translation lookup; compiled into the app bundle",
    url: "https://github.com/solidjs-community/solid-primitives",
  },
  {
    name: "Tailwind CSS",
    copyright: "Copyright (c) Tailwind Labs, Inc.",
    role: "generates the stylesheet shipped with the app",
    url: "https://github.com/tailwindlabs/tailwindcss",
  },
  {
    name: "Workbox",
    copyright: "Copyright 2018 Google LLC",
    role: "offline caching runtime inside the service worker",
    url: "https://github.com/GoogleChrome/workbox",
  },
  {
    name: "Vite",
    copyright: "Copyright (c) 2019-present, VoidZero Inc. and Vite contributors",
    role: "build tool; its module-preload helper is inlined into the app bundle",
    url: "https://github.com/vitejs/vite",
  },
];

interface BundledFont {
  /** 原本の font family 名。 */
  name: string;
  copyright: string;
  /** 同梱にあたって施した加工 (subset / rename)。OFL 上の modified version 告知を兼ねる。 */
  modification: string;
  /** 同一 origin に置いた OFL 全文への path。 */
  licensePath: string;
  url: string;
}

/** SIL Open Font License 1.1 のもとで self-host している font。 */
const BUNDLED_OFL_FONTS: readonly BundledFont[] = [
  {
    name: "Nunito",
    copyright:
      "Copyright 2014 The Nunito Project Authors (https://github.com/googlefonts/nunito)",
    modification:
      "digits 0-9 subset out of the variable font at weights 700 and 900, renamed to “Clockface Western”",
    licensePath: "/fonts/OFL-nunito.txt",
    url: "https://github.com/googlefonts/nunito",
  },
  {
    name: "Baloo Da 2",
    copyright:
      "Copyright 2019 The Baloo 2 Project Authors (https://github.com/EkType/Baloo2)",
    modification:
      "Bengali digits ০-৯ subset out of the variable font at weights 400 and 600, renamed to “Clockface Bengali”",
    licensePath: "/fonts/OFL-balooda2.txt",
    url: "https://github.com/EkType/Baloo2",
  },
];

/**
 * MIT license 本文のうち holder 行を除いた部分。第三者 entry の著作権表示は
 * 一覧側に個別に出し、本文はこの 1 部だけを共有する。
 */
const MIT_LICENSE_BODY = `Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.`;

const escapeHtml = (raw: string): string =>
  raw
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

/**
 * root LICENSE を読む。fork でも MIT の条件上ここに license file が在るはずで、
 * 無いまま build が通ると「自プロジェクト分の表示だけ空の licenses page」を
 * 配ってしまうので、黙って握りつぶさず build を止める。
 */
function readOwnLicense(): string {
  const path = join(ROOT_DIR, "LICENSE");
  try {
    return readFileSync(path, "utf8").trim();
  } catch (e) {
    throw new Error(
      `build-licenses: cannot read the root LICENSE file at ${path}. ` +
        "/licenses.html reproduces it verbatim, so the file must exist. " +
        `Cause: ${String(e)}`,
    );
  }
}

const PAGE_STYLE = `
  :root { color-scheme: light; }
  body {
    margin: 0;
    padding: 2rem 1.25rem 4rem;
    background: ${BRAND_CONFIG.backgroundColor};
    color: #3f3a35;
    font-family: system-ui, -apple-system, 'Segoe UI', sans-serif;
    line-height: 1.7;
  }
  main { max-width: 46rem; margin: 0 auto; }
  h1 { font-size: 1.5rem; margin: 0 0 0.25rem; }
  h2 { font-size: 1.1rem; margin: 2.5rem 0 0.5rem; }
  h3 { font-size: 0.95rem; margin: 1.5rem 0 0.25rem; }
  p, li { font-size: 0.9rem; }
  .lede { color: #6b625a; margin-top: 0; }
  ul { padding-left: 1.2rem; }
  li { margin-bottom: 0.75rem; }
  .note { color: #6b625a; font-size: 0.85rem; }
  a { color: #a8552f; }
  pre {
    background: #ffffff;
    border: 1px solid #e5dcd2;
    border-radius: 0.75rem;
    padding: 1rem;
    overflow-x: auto;
    font-size: 0.78rem;
    line-height: 1.55;
    white-space: pre-wrap;
    word-break: break-word;
  }
`;

function renderMitWork(work: BundledWork): string {
  return `      <li>
        <strong>${escapeHtml(work.name)}</strong> &mdash; ${escapeHtml(work.role)}<br />
        ${escapeHtml(work.copyright)}<br />
        <a href="${escapeHtml(work.url)}" rel="noopener noreferrer">${escapeHtml(work.url)}</a>
      </li>`;
}

function renderFont(font: BundledFont): string {
  return `      <li>
        <strong>${escapeHtml(font.name)}</strong> &mdash; ${escapeHtml(font.modification)}<br />
        ${escapeHtml(font.copyright)}<br />
        <a href="${escapeHtml(font.licensePath)}">Full SIL Open Font License 1.1 text</a>
        &middot;
        <a href="${escapeHtml(font.url)}" rel="noopener noreferrer">${escapeHtml(font.url)}</a>
      </li>`;
}

export function buildLicensesHtml(): string {
  const appName = OFFICIAL_BRAND[PAGE_LOCALE] ?? OFFICIAL_BRAND.ja;
  const sourceCode = BRAND_CONFIG.externalLinks.sourceCode;

  // brand / clock-face 条項は MIT の対象外なので、その線引きを読める場所 (repo の
  // NOTICE) へ誘導する。repo を公開しない fork では文ごと落とす。
  const brandTermsNote = sourceCode
    ? `      <p class="note">
        Names, logos, and the clock-face visual design are handled separately from
        the source code &mdash; see
        <a href="${escapeHtml(sourceCode)}/blob/main/NOTICE" rel="noopener noreferrer">NOTICE</a>
        in the repository.
      </p>
`
    : "";

  return `<!DOCTYPE html>
<html lang="${PAGE_LOCALE}" dir="ltr">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
    <meta name="theme-color" content="${escapeHtml(BRAND_CONFIG.themeColor)}" />
    <meta name="robots" content="noindex" />
    <title>Licenses &mdash; ${escapeHtml(appName)}</title>
    <style>${PAGE_STYLE}</style>
  </head>
  <body>
    <main>
      <h1>Licenses</h1>
      <p class="lede">
        ${escapeHtml(appName)} is open source, and it ships other people's work
        alongside its own. Everything below travels with the app.
      </p>

      <h2>This app</h2>
${brandTermsNote}      <pre>${escapeHtml(readOwnLicense())}</pre>

      <h2>Fonts</h2>
      <p>
        The clock-face digits are drawn with fonts served from this same domain,
        so no request ever leaves for a font CDN. Both are licensed under the
        SIL Open Font License 1.1 and both are modified versions &mdash; each was
        cut down to the digits this app draws and renamed, so neither should be
        mistaken for the original.
      </p>
      <ul>
${BUNDLED_OFL_FONTS.map(renderFont).join("\n")}
      </ul>

      <h2>Software</h2>
      <p>
        These are compiled into the JavaScript, CSS, and service worker that the
        app serves. All are licensed under the MIT License.
      </p>
      <ul>
${BUNDLED_MIT_WORKS.map(renderMitWork).join("\n")}
      </ul>
      <h3>MIT License</h3>
      <p class="note">Applies to each of the works listed above, under its own copyright notice.</p>
      <pre>${escapeHtml(MIT_LICENSE_BODY)}</pre>

      <h2>Not third-party</h2>
      <p>
        The interface icons are hand-drawn SVG paths in this repository, and the
        countdown chimes are synthesized by a build script here. Activity icons
        are emoji characters, drawn by the reader's own operating system rather
        than bundled as artwork.
      </p>
    </main>
  </body>
</html>
`;
}
