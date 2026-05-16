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
 * アクセス集計: locale HTML を正常返却した時のみ Analytics Engine に集計用
 * データポイントを記録する。redirect (302) は中間ステップなので計測対象外。
 * 個人を識別する情報は記録しない (IP / Cookie / UA 完全文字列など)。詳細は
 * https://futatoki.app/privacy/ 参照。
 */

import { matchLocale, matchAcceptLanguage } from "../i18n/match";
import { DEFAULT_LOCALE } from "../i18n/locales";

interface Env {
  ASSETS: { fetch: (request: Request) => Promise<Response> };
  ANALYTICS?: AnalyticsEngineDataset;
}

/**
 * Records an aggregate page-view data point. No-op when the ANALYTICS
 * binding is not configured (e.g. on forked deployments).
 *
 * Schema:
 *   blob1: country (CF edge geolocation, 2-letter ISO code)
 *   blob2: browser preferred language prefix (e.g. "ja")
 *   blob3: actual locale served (matched against supported locales)
 *   blob4: request path
 *   blob5: referrer hostname only ("direct" / "internal" / hostname)
 *   blob6: device type ("mobile" / "tablet" / "desktop")
 */
function recordPageView(
  request: Request,
  env: Env,
  servedLocale: string,
  requestPath: string,
): void {
  if (!env.ANALYTICS) return;

  const ua = request.headers.get("user-agent") ?? "";
  // Filter common bots and SNS crawlers; SNS crawlers hit this worker for OG
  // tags but should not count as human page views.
  if (
    /bot|crawler|spider|preview|monitor|fetch|curl|wget|headless|facebookexternalhit|whatsapp/i.test(
      ua,
    )
  ) {
    return;
  }

  const acceptLang = request.headers.get("accept-language") ?? "";
  const rawLang =
    acceptLang.split(",")[0]?.split(";")[0]?.trim().toLowerCase() ?? "";
  const langPrefix = rawLang ? (rawLang.split("-")[0] || "unknown") : "unknown";

  const country = request.cf?.country ?? "XX";

  const referer = request.headers.get("referer");
  let refHost = "direct";
  if (referer) {
    try {
      const refUrl = new URL(referer);
      const requestUrl = new URL(request.url);
      refHost =
        refUrl.hostname === requestUrl.hostname ? "internal" : refUrl.hostname;
    } catch {
      refHost = "invalid";
    }
  }

  const deviceType: string = /mobile|android.*mobile|iphone|ipod/i.test(ua)
    ? "mobile"
    : /tablet|ipad/i.test(ua)
      ? "tablet"
      : "desktop";

  env.ANALYTICS.writeDataPoint({
    blobs: [country, langPrefix, servedLocale, requestPath, refHost, deviceType],
    doubles: [1],
    indexes: [country],
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // ルート以外 (assets, manifest, sw, icons 等) はそのまま静的配信に渡す。
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
        // 正常レスポンスのみ集計対象（locale HTML が存在しない異常系は除外）
        if (response.status === 200) {
          recordPageView(request, env, matched, url.pathname + url.search);
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
