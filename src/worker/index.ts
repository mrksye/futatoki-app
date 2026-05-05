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
 */

import { matchLocale, matchAcceptLanguage } from "../i18n/match";
import { DEFAULT_LOCALE } from "../i18n/locales";

interface Env {
  ASSETS: { fetch: (request: Request) => Promise<Response> };
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
        return env.ASSETS.fetch(new Request(localeHtmlUrl.toString(), request));
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
