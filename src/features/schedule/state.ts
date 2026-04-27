import { persistedSignal } from "../../lib/persisted-signal";
import type { ScheduleIconId } from "./icons";

/**
 * 予定 (スケジュール) のセッション状態 + localStorage 永続化。
 *
 * データ構造: 分単位の整数 (0..1439) → アイコン ID。1 分 1 アイコンまで (上書き、警告なし)。
 *
 * 内部の生 setter (setScheduleRaw) は未 export。モジュール内でも生 setter を直接呼ばず必ず action
 * 経由で書き換える (= setScheduleAt は受け取った minutes を整数に丸めて 0..1439 に正規化する
 * invariant を壊させない)。
 */

/** key = minutes (0..1439 の整数文字列), value = ScheduleIconId */
export type Schedule = { [minutes: number]: ScheduleIconId };

/** 1 件の予定 (時刻 + アイコン)。schedule をループしたい時に scheduleEvents() で取得。 */
export interface ScheduleEvent {
  minutes: number;
  iconId: ScheduleIconId;
}

const [schedule, setScheduleRaw] = persistedSignal<Schedule>("schedule", {});

export { schedule };

/** 指定時刻 (分) のアイコン id を返す。無ければ undefined。 */
export const scheduleAt = (minutes: number): ScheduleIconId | undefined =>
  schedule()[Math.round(minutes)];

/** 全予定を {minutes, iconId} の配列で返す (順序は insertion order)。 */
export const scheduleEvents = (): ScheduleEvent[] =>
  Object.entries(schedule()).map(([m, id]) => ({
    minutes: Number(m),
    iconId: id,
  }));

/** 指定時刻にアイコンを置く (既存があれば上書き、警告なし)。
 *  minutes は整数に丸めて 0..1439 に wrap-around してから保存する。 */
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
