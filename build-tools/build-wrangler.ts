/**
 * wrangler.jsonc.template の placeholder を環境変数で置換して wrangler.jsonc を生成する。
 *
 * 想定運用: CF Workers Builds の dashboard で Build Variables
 * (WORKER_NAME / DATASET_NAME / ROUTE_DOMAIN) を設定し、build command を
 * `bun run build:wrangler && bun run build` にする。push 後 CF 側で template から
 * deployment-specific な wrangler.jsonc が組み立てられて wrangler deploy が走る。
 *
 * ローカルでは wrangler.jsonc を手書きで持つ運用なので package.json の build には
 * 含めていない。緊急 local deploy の前にだけ手動で実行する想定。
 */
import { readFileSync, writeFileSync } from "node:fs";

const required = ["WORKER_NAME", "DATASET_NAME", "ROUTE_DOMAIN"] as const;
const missing = required.filter((key) => !process.env[key]);
if (missing.length > 0) {
  console.error(`Missing required env vars: ${missing.join(", ")}`);
  console.error(
    "Set them as Build Variables in the Cloudflare dashboard, or export them in your shell.",
  );
  process.exit(1);
}

// .trim() でダッシュボード側で混入しがちな末尾改行・余分な空白を落とす。
// 入ったまま JSON に埋め込むと closing quote 前で行が割れて UnexpectedEndOfString になる。
const template = readFileSync("wrangler.jsonc.template", "utf-8");
const result = template
  .replaceAll("__WORKER_NAME__", process.env["WORKER_NAME"]!.trim())
  .replaceAll("__DATASET_NAME__", process.env["DATASET_NAME"]!.trim())
  .replaceAll("__ROUTE_DOMAIN__", process.env["ROUTE_DOMAIN"]!.trim());

writeFileSync("wrangler.jsonc", result);
console.log("Generated wrangler.jsonc from template");
