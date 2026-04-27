/**
 * 反対方向の回転 (「針は右回りのみ」原則に反する操作) が試みられた時の notification 用 signal。
 * 現在の発火点は wheel.ts の上スクロール検出のみ (将来 reverse drag 等もここに集める)。
 *
 * incrementing counter で実装している (boolean だと連続 trigger 時に false→true 遷移が起きず
 * 再発火できないため)。受信側 (ClockLayout) は値の変化を createEffect で観測してシェイクを発火する。
 */
import { createSignal } from "solid-js";

const [resistTrigger, setResistTrigger] = createSignal(0);

export { resistTrigger };

export const notifyResistance = () => setResistTrigger((n) => n + 1);
