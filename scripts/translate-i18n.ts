/**
 * ja.json を source of truth として 19 言語の locale JSON を Claude API で一括生成。
 *
 * 使い方:
 *   ANTHROPIC_API_KEY=sk-ant-... bun run scripts/translate-i18n.ts
 *
 * 実行モデル: claude-opus-4-7（adaptive thinking、prompt caching 有効）
 *
 * 設計メモ:
 *   - system に「翻訳方針 + source JSON」を置き cache_control でキャッシュ化。
 *     毎回変わるのは user message の「対象ロケール」だけなので、
 *     2言語目以降は cache_read_input_tokens が効く。
 *   - 最初の 1 言語だけ await で流してキャッシュを温め、残り 18 言語を Promise.all で並列実行。
 *     cache write は1回だけ、残りは cache read で流れる。
 *   - 出力は structured output（output_config.format）で JSON shape を強制、
 *     ja.json とキー構造が 1:1 一致することを API レベルで保証する。
 */

import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import Anthropic from "@anthropic-ai/sdk";
import { SUPPORTED_LOCALES, SOURCE_LOCALE } from "../src/i18n/locales";

/** 同時接続のレート制限を踏まないための並列数。tier 上げたら増やせる */
const CONCURRENCY = 3;

const __dirname = dirname(fileURLToPath(import.meta.url));
const RESOURCES_DIR = join(__dirname, "..", "src", "i18n", "resources");

const sourcePath = join(RESOURCES_DIR, `${SOURCE_LOCALE}.json`);
const sourceRaw = readFileSync(sourcePath, "utf-8");
const sourceDict = JSON.parse(sourceRaw) as Record<string, Record<string, string>>;

// 翻訳対象：source 以外の全ロケール
const targets = SUPPORTED_LOCALES.filter((l) => l.code !== SOURCE_LOCALE);

// 出力 JSON の構造を source から派生させて JSON Schema 化。
// これを output_config.format に渡すと、モデルが必ずこの形の JSON を返す。
function buildOutputSchema(template: Record<string, Record<string, string>>) {
  const properties: Record<string, unknown> = {};
  const required: string[] = [];
  for (const [group, keys] of Object.entries(template)) {
    const groupProps: Record<string, { type: "string" }> = {};
    const groupRequired: string[] = [];
    for (const key of Object.keys(keys)) {
      groupProps[key] = { type: "string" };
      groupRequired.push(key);
    }
    properties[group] = {
      type: "object",
      properties: groupProps,
      required: groupRequired,
      additionalProperties: false,
    };
    required.push(group);
  }
  return {
    type: "object",
    properties,
    required,
    additionalProperties: false,
  };
}

const outputSchema = buildOutputSchema(sourceDict);

const SYSTEM_INSTRUCTIONS = `You are a professional UI localizer specializing in children's educational apps.

Context:
- Target audience is young children learning to read clocks.
- The source language is Japanese. Source uses hiragana (not kanji) to stay readable for kids.
- The app is an analog clock educational tool with modes like "detailed view" vs "clean view", "sector coloring" vs "badge coloring", and a free-rotation manual mode.

Translation rules:
1. Match the source's playful, simple tone. Keep strings short — they go on small buttons.
2. Avoid technical jargon. Prefer everyday kid-friendly words in the target language.
3. Preserve emoji exactly as they appear (e.g. "☀️ AM" → keep the sun emoji).
4. "24h" and "12h" are universally understood time-format labels. Keep them as-is in every language unless the target language has a strongly established local convention.
5. Always use Latin digits (0-9) for any number in a string, including inline numbers like "1 minute back". Do NOT use native digit systems (Arabic-Indic ٠١٢, Eastern Arabic-Indic ۰۱۲, Devanagari ०१२, Bengali ০১২, Tamil ௦௧௨, Thai ๐๑๒) — keep every digit as Latin regardless of the surrounding script.
6. Return exactly the same JSON key structure as the source. Do not add, remove, or rename keys.
7. Every string MUST be translated — no empty strings, no untranslated Japanese.

Key-specific notes:
- settings.sukkiri / kuwashiku: "clean/simple view" vs "detailed view" of the clock.
- settings.sector / badge: two color styles — "pie slices on the clock face" vs "AM/PM badge".
- settings.rotateEnter / rotateExit: toggle into/out of free-rotation mode. rotateExit means "back to the normal clock".
- settings.mergeToSingle / splitToTwo: stack the two AM/PM clocks into one, or separate them back.
- settings.rewindMinute: "rewind 1 minute" button.
- settings.styleToCrank / styleToDrag: two drag styles — "winding like a crank" vs "free drag".
- settings.autoStart / autoStop: auto-rotate clock hands / stop auto-rotation.
- settings.random: jump to a random time (in 15-minute steps).

Palette names (color palette picker button labels). Keep them short and playful. Each name should hint at the palette's character:
- palette.distinct12: High-contrast vivid categorical colors. Source "くっきりいろ" ≈ "crisp colors / sharp colors".
- palette.vivid: Sky gradient through the day — dawn, noon, sunset, night. Source "そらのいろ" = "sky colors".
- palette.ygb: Three-color cycle of blue / yellow / green. Source "あおきみどり" combines ao (blue) + ki (yellow) + midori (green). Use a short, natural phrase that lists the three colors — prefer readability. Do NOT invent mashed-up words like "bluyellowgreen" that don't exist in the target language.
- palette.primary3: The three painter's primaries — red, yellow, blue. Source "さんげんしょく" = "three primary colors".
- palette.wheel: The 12-hue color wheel (Itten). Source "いろのわ" = "color wheel / color ring".
- palette.cud12: Color-Universal-Design palette accessible to color-vision deficiency. Source "みんなのいろ" = "everyone's colors" (emphasizing inclusivity). Convey the inclusive/for-everyone nuance, not a literal "color blind mode".

Source JSON (canonical reference):
\`\`\`json
${sourceRaw.trim()}
\`\`\`
`;

async function translateOne(client: Anthropic, targetCode: string, targetName: string, targetEndonym: string): Promise<Record<string, Record<string, string>>> {
  const response = await client.messages.create({
    model: "claude-opus-4-7",
    max_tokens: 16000,
    thinking: { type: "adaptive" },
    system: [
      {
        type: "text",
        text: SYSTEM_INSTRUCTIONS,
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [
      {
        role: "user",
        content: `Translate the source JSON into ${targetName} (${targetEndonym}, BCP 47 tag: ${targetCode}). Return JSON with the exact same key structure.`,
      },
    ],
    output_config: {
      format: {
        type: "json_schema",
        schema: outputSchema,
      },
    },
  } as Parameters<typeof client.messages.create>[0]);

  // JSON_SCHEMA 指定時、レスポンスは `content[0].text` に JSON 文字列で入る
  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error(`[${targetCode}] No text block in response`);
  }

  const cacheRead = response.usage.cache_read_input_tokens ?? 0;
  const cacheWrite = response.usage.cache_creation_input_tokens ?? 0;
  console.info(
    `  ✓ ${targetCode.padEnd(6)} (${targetName.padEnd(28)}) ` +
      `in=${response.usage.input_tokens} cacheR=${cacheRead} cacheW=${cacheWrite} out=${response.usage.output_tokens}`,
  );

  return JSON.parse(textBlock.text) as Record<string, Record<string, string>>;
}

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("ANTHROPIC_API_KEY が未設定や。環境変数にセットしてからもう一回実行して。");
    process.exit(1);
  }

  const client = new Anthropic();

  const writeResult = (code: string, data: Record<string, Record<string, string>>) => {
    const outPath = join(RESOURCES_DIR, `${code}.json`);
    writeFileSync(outPath, JSON.stringify(data, null, 2) + "\n", "utf-8");
  };

  // 既に JSON がある locale はスキップ（失敗分だけ再実行できる）
  const pending = targets.filter(
    (loc) => !existsSync(join(RESOURCES_DIR, `${loc.code}.json`)),
  );
  const skipped = targets.length - pending.length;

  console.info(`Source: ${SOURCE_LOCALE}.json`);
  console.info(`Targets: ${targets.length} locales (skipping ${skipped} already generated, translating ${pending.length})`);
  console.info(`Concurrency: ${CONCURRENCY}`);
  console.info();

  if (pending.length === 0) {
    console.info("何もやることないで。全 locale 既に生成済み。");
    return;
  }

  // 固定サイズのワーカープールで並列実行
  const queue = [...pending];
  const failures: string[] = [];
  const worker = async () => {
    while (true) {
      const loc = queue.shift();
      if (!loc) return;
      try {
        const result = await translateOne(client, loc.code, loc.name, loc.endonym);
        writeResult(loc.code, result);
      } catch (err) {
        failures.push(`${loc.code}: ${err instanceof Error ? err.message : err}`);
      }
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, pending.length) }, worker),
  );

  console.info();
  if (failures.length > 0) {
    console.error(`${failures.length} 件失敗（もう一回実行すれば失敗分だけ再試行される）:`);
    for (const f of failures) console.error(`  ✗ ${f}`);
    process.exit(1);
  }
  console.info(`${pending.length} locales 書き出し完了。`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
