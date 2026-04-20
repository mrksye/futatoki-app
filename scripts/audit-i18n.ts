/**
 * 全 locale JSON の自動監査。目視確認できない言語のサニティチェック用。
 *
 *   - キー構造が ja.json と 1:1 一致
 *   - 空文字なし
 *   - ひらがな/カタカナ/漢字の残留なし（zh/zh-TW は漢字の残留判定を除外）
 *   - 期待スクリプトの文字が少なくとも1文字以上含まれる
 *
 * 使い方:
 *   bun run scripts/audit-i18n.ts
 */

import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { SUPPORTED_LOCALES, SOURCE_LOCALE } from "../src/i18n/locales";

const RESOURCES_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "src",
  "i18n",
  "resources",
);

type Dict = Record<string, Record<string, string>>;

const source = JSON.parse(readFileSync(join(RESOURCES_DIR, `${SOURCE_LOCALE}.json`), "utf-8")) as Dict;

// ja キーの完全フラット配列
const sourceKeys: string[] = [];
for (const [group, keys] of Object.entries(source)) {
  for (const k of Object.keys(keys)) sourceKeys.push(`${group}.${k}`);
}
sourceKeys.sort();

// 日本語かな/カタカナの検出（漢字は中国語と共通なので対象外）
const KANA_RE = /[\u3040-\u309F\u30A0-\u30FF]/;

// 各 locale で「翻訳されたら必ず含まれるはず」の文字レンジ
// 英語のような Latin 言語は emoji 以外全部 ASCII でもOKなので null
const EXPECTED_SCRIPT: Record<string, RegExp | null> = {
  en: null,
  es: null,
  fr: null,
  de: null,
  "pt-BR": null,
  id: null,
  tr: null,
  pl: null,
  "zh-CN": /[\u4E00-\u9FFF]/,     // CJK Unified Ideographs
  "zh-TW": /[\u4E00-\u9FFF]/,
  ko: /[\uAC00-\uD7AF]/,           // Hangul Syllables
  ru: /[\u0400-\u04FF]/,           // Cyrillic
  ar: /[\u0600-\u06FF]/,           // Arabic
  fa: /[\u0600-\u06FF]/,
  ur: /[\u0600-\u06FF]/,
  th: /[\u0E00-\u0E7F]/,           // Thai
  hi: /[\u0900-\u097F]/,           // Devanagari
  bn: /[\u0980-\u09FF]/,           // Bengali
  ta: /[\u0B80-\u0BFF]/,           // Tamil
};

// ja/en/zh-CN/zh-TW では漢字があってもOK。他は漢字混入もNG
const KANJI_OK: Set<string> = new Set(["ja", "zh-CN", "zh-TW"]);
const KANJI_RE = /[\u4E00-\u9FFF]/;

type Issue = { locale: string; kind: string; detail: string };

const issues: Issue[] = [];

// 実在ファイル一覧
const files = new Set(readdirSync(RESOURCES_DIR).filter((f) => f.endsWith(".json")));

for (const loc of SUPPORTED_LOCALES) {
  if (loc.code === SOURCE_LOCALE) continue;

  const filename = `${loc.code}.json`;
  if (!files.has(filename)) {
    issues.push({ locale: loc.code, kind: "missing", detail: "file not found" });
    continue;
  }

  let dict: Dict;
  try {
    dict = JSON.parse(readFileSync(join(RESOURCES_DIR, filename), "utf-8")) as Dict;
  } catch (e) {
    issues.push({ locale: loc.code, kind: "parse", detail: String(e) });
    continue;
  }

  // キー構造チェック
  const actualKeys: string[] = [];
  for (const [group, keys] of Object.entries(dict)) {
    for (const k of Object.keys(keys)) actualKeys.push(`${group}.${k}`);
  }
  actualKeys.sort();
  const missing = sourceKeys.filter((k) => !actualKeys.includes(k));
  const extra = actualKeys.filter((k) => !sourceKeys.includes(k));
  if (missing.length) issues.push({ locale: loc.code, kind: "missing-keys", detail: missing.join(", ") });
  if (extra.length) issues.push({ locale: loc.code, kind: "extra-keys", detail: extra.join(", ") });

  // 値の中身チェック
  const expected = EXPECTED_SCRIPT[loc.code];
  let foundExpectedScript = expected === null;

  for (const [group, keys] of Object.entries(dict)) {
    for (const [k, v] of Object.entries(keys)) {
      const path = `${group}.${k}`;
      if (typeof v !== "string") {
        issues.push({ locale: loc.code, kind: "non-string", detail: `${path}=${JSON.stringify(v)}` });
        continue;
      }
      if (v.trim() === "") {
        issues.push({ locale: loc.code, kind: "empty", detail: path });
        continue;
      }
      // かな混入は常に NG
      if (KANA_RE.test(v)) {
        issues.push({ locale: loc.code, kind: "kana-leak", detail: `${path}="${v}"` });
      }
      // 漢字混入は ja/zh のみ OK
      if (!KANJI_OK.has(loc.code) && KANJI_RE.test(v)) {
        issues.push({ locale: loc.code, kind: "kanji-leak", detail: `${path}="${v}"` });
      }
      // 期待スクリプト検出
      if (expected && expected.test(v)) foundExpectedScript = true;
    }
  }

  if (!foundExpectedScript) {
    issues.push({
      locale: loc.code,
      kind: "no-expected-script",
      detail: `no character in expected script range was found`,
    });
  }
}

if (issues.length === 0) {
  console.log(`✓ all ${SUPPORTED_LOCALES.length - 1} locales passed the audit`);
  process.exit(0);
}

console.log(`✗ ${issues.length} issue(s) found:`);
const byLocale = new Map<string, Issue[]>();
for (const i of issues) {
  const arr = byLocale.get(i.locale) ?? [];
  arr.push(i);
  byLocale.set(i.locale, arr);
}
for (const [loc, list] of byLocale) {
  console.log(`\n[${loc}]`);
  for (const i of list) console.log(`  ${i.kind}: ${i.detail}`);
}
process.exit(1);
