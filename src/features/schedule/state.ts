import { persistedSignal } from "../../lib/persisted-signal";
import type { ScheduleIconId } from "./icons";

/**
 * 予定 (スケジュール) のセッション状態 + localStorage 永続化。
 *
 * データ構造: 分単位の整数 (0..1439) → アイコン ID。
 * 1分1アイコンまで (上書き、警告なし)。
 *
 * Public API:
 *   - accessor: schedule, scheduleAt
 *   - action:   setScheduleAt, deleteScheduleAt
 *
 * 内部の生 setter (setScheduleRaw) は意図的に export していない。
 * モジュール内でも生 setter を直接呼ばず、必ず action 経由で書き換えること。
 *
 * 補足: setScheduleAt は受け取った minutes を整数に丸めて 0..1439 に正規化する
 *       (drag や auto-rotate からの小数値、負数や 1440 以上の入力もここで整える)。
 *       生 setter を直接呼べる構造にすると、この invariant を壊せてしまう。
 */

/** key = minutes (0..1439 の整数文字列), value = ScheduleIconId */
export type Schedule = { [minutes: number]: ScheduleIconId };

/** 1件の予定 (時刻 + アイコン)。schedule をループしたい時に scheduleEvents() で取得。 */
export interface ScheduleEvent {
  minutes: number;
  iconId: ScheduleIconId;
}

// ===== Internal state (raw setter is intentionally not exported) =====
const [schedule, setScheduleRaw] = persistedSignal<Schedule>("schedule", {});

// ===== Public accessors (read-only) =====
export { schedule };

/** 指定時刻 (分) のアイコン id を返す。無ければ undefined。 */
export const scheduleAt = (minutes: number): ScheduleIconId | undefined =>
  schedule()[Math.round(minutes)];

/** 全予定を {minutes, iconId} の配列で返す。順序は minutes 昇順ではない (insertion order)。 */
export const scheduleEvents = (): ScheduleEvent[] =>
  Object.entries(schedule()).map(([m, id]) => ({
    minutes: Number(m),
    iconId: id,
  }));

// ===== Public actions (only valid mutations live here) =====

/**
 * 指定時刻にアイコンを置く (既存があれば上書き、警告なし)。
 * minutes は整数に丸めて 0..1439 に wrap-around してから保存。
 */
export const setScheduleAt = (minutes: number, iconId: ScheduleIconId) => {
  const snapped = ((Math.round(minutes) % 1440) + 1440) % 1440;
  setScheduleRaw(s => ({ ...s, [snapped]: iconId }));
};

/** 指定時刻のアイコンを削除。無ければ no-op。 */
export const deleteScheduleAt = (minutes: number) => {
  const snapped = ((Math.round(minutes) % 1440) + 1440) % 1440;
  setScheduleRaw(s => {
    if (!(snapped in s)) return s;
    const { [snapped]: _removed, ...rest } = s;
    return rest;
  });
};
