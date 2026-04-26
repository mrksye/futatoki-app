/**
 * 反対方向の回転 (= 「針は右回りのみ」原則に反する操作) が試みられた時の
 * フィードバック notification 用 signal。
 *
 * 現在の発火点は wheel.ts の上スクロール検出のみ。将来 reverse drag や
 * 逆ジェスチャの検出を足す時もここに集める。
 *
 * 値は incrementing counter にしてある。boolean signal だと連続 trigger 時に
 * false→true の遷移が発生せず再発火できないため、counter で「変化したこと」
 * だけを通知する。受信側 = ClockLayout は createEffect で値の変化を見て
 * 針のシェイクアニメーションを発火する。
 *
 * Public API:
 *   - resistTrigger    (read-only signal)
 *   - notifyResistance (action)
 */
import { createSignal } from "solid-js";

const [resistTrigger, setResistTrigger] = createSignal(0);

export { resistTrigger };

export const notifyResistance = () => setResistTrigger((n) => n + 1);
