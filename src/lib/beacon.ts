/**
 * 起動ビーコン: アプリ / LP が開かれた時に、集計用の最小データポイントを 1 回だけ送る。
 *
 * なぜ要るか:
 *   サーバ側の recordPageView は「/」の HTML 配信時しか撃てず、しかも
 *   インストール済み PWA のオフライン再起動は origin に届かないため計測不能。
 *   retention の代理信号 (= standalone 起動か / デバイス種別 / 起動の時刻) を取るには
 *   クライアント側からの 1 発が要る。
 *
 * プライバシー:
 *   送るのは「その起動の属性」だけ。Cookie / 永続 ID / セッション ID は一切持たず、
 *   個人やブラウザの再識別はしない。国は送らず、エッジ (CF) 側で IP から導出される
 *   国名のみがサーバで付与される (IP 自体は保存しない)。
 *   → privacy policy の「記録しない項目」と矛盾しない。
 *
 * 限界 (正直に):
 *   オフライン起動は送れない (ネットワーク不在)。よって standalone 件数は
 *   「起動時にオンラインだった分」の下限値であり、常時表示の壁掛け時計運用は取りこぼす。
 */

const BEACON_PATH = "/_beacon";

let sent = false;

type DisplayMode = "standalone" | "browser";
type DeviceType = "mobile" | "tablet" | "desktop";

interface BeaconBody {
  mode: DisplayMode;
  device: DeviceType;
  locale: string;
}

interface IosNavigator {
  standalone?: boolean;
}

function detectDisplayMode(): DisplayMode {
  // Chromium / Android / 近年の Safari: display-mode メディアクエリ。
  const installed =
    window.matchMedia("(display-mode: standalone)").matches ||
    window.matchMedia("(display-mode: fullscreen)").matches ||
    window.matchMedia("(display-mode: minimal-ui)").matches;
  if (installed) return "standalone";

  // display-mode を出さない端末向けフォールバック (iOS 旧 Safari の名残)。
  const ios = navigator as Navigator & IosNavigator;
  if (ios.standalone === true) return "standalone";

  return "browser";
}

function detectDevice(): DeviceType {
  // ポインタが粗い = タッチ主体。マウス主体なら desktop。
  // この方式なら iPad が UA を "Macintosh" と詐称しても、タッチ主体として拾える。
  const coarse = window.matchMedia("(pointer: coarse)").matches;
  if (!coarse) return "desktop";

  // タッチ端末は画面短辺で phone / tablet を分ける (px の目安。厳密ではない)。
  const shortSide = Math.min(window.screen.width, window.screen.height);
  return shortSide >= 600 ? "tablet" : "mobile";
}

function deliver(body: BeaconBody): void {
  const payload = JSON.stringify(body);

  // sendBeacon: アンロード直後でも取りこぼしにくい。Blob で content-type を付ける。
  try {
    if (typeof navigator.sendBeacon === "function") {
      const blob = new Blob([payload], { type: "application/json" });
      if (navigator.sendBeacon(BEACON_PATH, blob)) return;
    }
  } catch (e) {
    try {
      console.warn("[beacon] sendBeacon failed, falling back to fetch", e);
    } catch (_) {}
  }

  void fetch(BEACON_PATH, {
    method: "POST",
    body: payload,
    headers: { "content-type": "application/json" },
    keepalive: true,
  }).catch((e) => {
    try {
      console.warn("[beacon] fetch fallback failed", e);
    } catch (_) {}
  });
}

/**
 * アプリ起動時に 1 度だけ呼ぶ。オフライン時・二重呼び出し時は何もしない。
 */
export function reportAppOpen(locale: string): void {
  if (sent) return;
  if (typeof navigator.onLine === "boolean" && !navigator.onLine) return;
  sent = true;

  deliver({
    mode: detectDisplayMode(),
    device: detectDevice(),
    locale,
  });
}
