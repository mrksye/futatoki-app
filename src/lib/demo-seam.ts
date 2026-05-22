/**
 * 開発時のみ window.__seedDemoActivities を露出する demo 用 seam。
 * futatoki-lp 側 scripts/screenshots.mjs から Playwright 経由で呼ばれて、
 * Top hero 動画の「12 種のできごとを 24h 文字盤に超高速で配置する」演出を録画する用。
 *
 * import.meta.env.DEV ガード下でのみ attach。本番 bundle ではブロックごと dead-code 化されて
 * setActivityAt / playPoyon3 / deleteAllActivity の import も tree-shake される。
 * UI には一切影響しない (window プロパティを 1 個生やすだけ、picker は開かない)。
 */
import { deleteAllActivity, setActivityAt } from "../features/activity/state";
import type { ActivityIconId } from "../features/activity/icons";
import { playPoyon3 } from "./motion";

export interface DemoSeedEvent {
  minutes: number;
  iconId: ActivityIconId;
}

export interface DemoSeedOpts {
  /** 各 event を置く間隔 (ms)。デフォルト 60ms。 */
  staggerMs?: number;
  /** 置いた直後に playPoyon3 を発火させるか。デフォルト true。 */
  spawnPoyon?: boolean;
  /** 開始前に既存 activity を全削除するか。デフォルト true。 */
  clearFirst?: boolean;
}

if (import.meta.env.DEV) {
  (window as unknown as {
    __seedDemoActivities?: (events: DemoSeedEvent[], opts?: DemoSeedOpts) => Promise<void>;
  }).__seedDemoActivities = async (events, opts) => {
    const staggerMs = opts?.staggerMs ?? 60;
    const spawnPoyon = opts?.spawnPoyon ?? true;
    const clearFirst = opts?.clearFirst ?? true;
    if (clearFirst) deleteAllActivity();
    for (const ev of events) {
      setActivityAt(ev.minutes, ev.iconId);
      if (spawnPoyon) {
        // EventIcon の <g> ref callback で data-event-minutes が setAttribute されるまで
        // 1 rAF 待つ。Solid の reactive flush + DOM commit が確定したフレームで querySelector。
        await new Promise<void>((r) => requestAnimationFrame(() => r()));
        document
          .querySelectorAll<SVGGElement>(`[data-event-minutes="${ev.minutes}"]`)
          .forEach((el) => playPoyon3(el));
      }
      if (staggerMs > 0) {
        await new Promise<void>((r) => setTimeout(r, staggerMs));
      }
    }
  };
}
