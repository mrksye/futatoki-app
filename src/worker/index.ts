/**
 * NOTE: Cloudflare Worker code lives under src/ alongside browser code
 * because it shares i18n logic with the SolidJS app (../i18n/match etc).
 * Restructuring to a top-level worker/ directory would require moving
 * the shared i18n module into a separate package; deferred until the
 * complexity justifies it.
 */

/**
 * Cloudflare Worker entry: `/?lang=xx` を見て locale 別 HTML を返す。
 *
 * 必要性: SNS クローラ (Twitterbot / facebookexternalhit / Slackbot 等) は JS を
 * 実行しないため、OG タグを locale 別に出すには静的 HTML を URL ごとに切り替えて
 * 配信するしかない。本 Worker が `/?lang=xx` リクエストを受け、build 時に焼いた
 * dist/locales/{locale}.html を ASSETS binding から取得してそのまま返す。
 *
 * `?lang=` が無いリクエストは Accept-Language を q-value 順に解析して
 * /?lang={detected} に 302 redirect。これでブラウザのアドレスバーに必ず lang が
 * 残るので、ユーザがその URL をコピーして SNS にシェアした際、受信側のクローラ
 * は `?lang=xx` 付きの URL を fetch して送信側言語の OG カードを生成する。
 *
 * 旧シェア URL (= `?lang=` 無し) を踏んだクローラは Accept-Language 既定の en
 * 系で redirect され、en HTML から OG を取得する。送信側言語は不確定だが、
 * グローバル fallback として en に倒すのが OSS 公開の妥当解。
 *
 * アクセス集計:
 *   - LP の locale HTML 配信時 (surface=lp): サーバ側で計測。
 *   - アプリ起動時 (surface=app): /_beacon にクライアントから 1 発投げてもらい計測。
 *     PWA standalone / 正確なデバイス種別 / 起動時刻 を取れる (retention 代理信号)。
 *   個人を識別する情報は記録しない (IP / Cookie / Session ID / UA 完全文字列など)。
 *   詳細は https://futatoki.app/privacy/ 参照。
 */

import { matchLocale, matchAcceptLanguage } from "../i18n/match";
import { DEFAULT_LOCALE } from "../i18n/locales";

interface Env {
  ASSETS: { fetch: (request: Request) => Promise<Response> };
  ANALYTICS?: AnalyticsEngineDataset;
}

type Surface = "lp" | "app";
type DisplayMode = "standalone" | "browser" | "unknown";
type DeviceType = "mobile" | "tablet" | "desktop";

const BEACON_PATH = "/_beacon";
const MAX_BEACON_BYTES = 256;

const BOT_RE =
  /bot|crawler|spider|preview|monitor|fetch|curl|wget|headless|facebookexternalhit|whatsapp/i;

interface DataPoint {
  country: string;
  langPrefix: string;
  locale: string;
  /** pathname のみ。クエリ文字列は含めない (privacy policy 準拠)。 */
  path: string;
  refHost: string;
  device: DeviceType;
  surface: Surface;
  mode: DisplayMode;
}

/**
 * 集計データポイントを 1 件書く。ANALYTICS binding 未設定 (fork 等) では no-op。
 *
 * Schema:
 *   blob1: country (CF エッジ判定の 2 文字 ISO)
 *   blob2: ブラウザ優先言語の prefix (例 "ja")
 *   blob3: 配信 / 表示 locale
 *   blob4: path (pathname のみ。query は含めない)
 *   blob5: referrer host のみ ("direct" / "internal" / hostname)
 *   blob6: device type ("mobile" / "tablet" / "desktop")
 *   blob7: surface ("lp" = ランディング閲覧, "app" = アプリ起動ビーコン)
 *   blob8: display mode ("standalone" / "browser" / "unknown")
 */
function writeDataPoint(env: Env, p: DataPoint): void {
  if (!env.ANALYTICS) return;
  env.ANALYTICS.writeDataPoint({
    blobs: [
      p.country,
      p.langPrefix,
      p.locale,
      p.path,
      p.refHost,
      p.device,
      p.surface,
      p.mode,
    ],
    doubles: [1],
    indexes: [p.country],
  });
}

function langPrefixOf(request: Request): string {
  const acceptLang = request.headers.get("accept-language") ?? "";
  const raw =
    acceptLang.split(",")[0]?.split(";")[0]?.trim().toLowerCase() ?? "";
  return raw ? raw.split("-")[0] || "unknown" : "unknown";
}

function refHostOf(request: Request): string {
  const referer = request.headers.get("referer");
  if (!referer) return "direct";
  try {
    const ref = new URL(referer);
    const self = new URL(request.url);
    return ref.hostname === self.hostname ? "internal" : ref.hostname;
  } catch {
    return "invalid";
  }
}

/** UA からの粗いデバイス推定。サーバ側の限界 (iPad は Macintosh を詐称) は許容。 */
function deviceFromUA(ua: string): DeviceType {
  if (/mobile|android.*mobile|iphone|ipod/i.test(ua)) return "mobile";
  if (/tablet|ipad/i.test(ua)) return "tablet";
  return "desktop";
}

function isBot(ua: string): boolean {
  return BOT_RE.test(ua);
}

/** クライアント送信値を許可リストで検証 (信用しない)。 */
function asDevice(v: unknown, fallback: DeviceType): DeviceType {
  return v === "mobile" || v === "tablet" || v === "desktop" ? v : fallback;
}
function asMode(v: unknown): DisplayMode {
  return v === "standalone" || v === "browser" ? v : "unknown";
}

/**
 * /_beacon: アプリ起動ビーコンを受けて集計。
 * 受け取るのは {mode, device, locale} だけ。個人識別情報は受け取らない。
 */
async function handleBeacon(request: Request, env: Env): Promise<Response> {
  const ua = request.headers.get("user-agent") ?? "";
  if (isBot(ua)) return new Response(null, { status: 204 });

  const declaredLen = Number(request.headers.get("content-length") ?? "0");
  if (declaredLen > MAX_BEACON_BYTES) {
    return new Response(null, { status: 413 });
  }

  let mode: DisplayMode = "unknown";
  let device: DeviceType = deviceFromUA(ua);
  let locale = "unknown";

  try {
    const text = await request.text();
    if (text.length > MAX_BEACON_BYTES) {
      return new Response(null, { status: 413 });
    }
    const parsed: unknown = JSON.parse(text);
    if (parsed && typeof parsed === "object") {
      const b = parsed as Record<string, unknown>;
      mode = asMode(b.mode);
      device = asDevice(b.device, device);
      const matched = typeof b.locale === "string" ? matchLocale(b.locale) : null;
      locale = matched ?? "unknown";
    }
  } catch {
    // 壊れた body は捨てて 204。計測は撃てなくてもエラーにはしない。
    return new Response(null, { status: 204 });
  }

  writeDataPoint(env, {
    country: request.cf?.country ?? "XX",
    langPrefix: langPrefixOf(request),
    locale,
    path: BEACON_PATH,
    refHost: refHostOf(request),
    device,
    surface: "app",
    mode,
  });

  return new Response(null, { status: 204 });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // アプリ起動ビーコン (POST のみ)。
    if (url.pathname === BEACON_PATH) {
      if (request.method !== "POST") {
        return new Response(null, { status: 405 });
      }
      return handleBeacon(request, env);
    }

    // ルート以外 (assets, manifest, sw, icons 等) はそのまま静的配信へ。
    if (url.pathname !== "/") {
      return env.ASSETS.fetch(request);
    }

    const requestedLang = url.searchParams.get("lang");

    if (requestedLang !== null) {
      const matched = matchLocale(requestedLang);
      if (matched) {
        const localeHtmlUrl = new URL(`/locales/${matched}.html`, url);
        const response = await env.ASSETS.fetch(
          new Request(localeHtmlUrl.toString(), request),
        );
        // 正常レスポンスのみ集計対象 (locale HTML が無い異常系は除外)。
        if (response.status === 200) {
          const ua = request.headers.get("user-agent") ?? "";
          if (!isBot(ua)) {
            writeDataPoint(env, {
              country: request.cf?.country ?? "XX",
              langPrefix: langPrefixOf(request),
              locale: matched,
              path: url.pathname,
              refHost: refHostOf(request),
              device: deviceFromUA(ua),
              surface: "lp",
              mode: "unknown",
            });
          }
        }
        return response;
      }
      // 不正な ?lang=xx 値: DEFAULT_LOCALE に正規化して redirect。
      const fallback = new URL(url.toString());
      fallback.searchParams.set("lang", DEFAULT_LOCALE);
      return Response.redirect(fallback.toString(), 302);
    }

    // ?lang= 不在: Accept-Language で振り分け、ヒットしなければ DEFAULT_LOCALE。
    const detected = matchAcceptLanguage(request.headers.get("Accept-Language"));
    const target = detected ?? DEFAULT_LOCALE;
    const redirected = new URL(url.toString());
    redirected.searchParams.set("lang", target);
    return Response.redirect(redirected.toString(), 302);
  },
};
