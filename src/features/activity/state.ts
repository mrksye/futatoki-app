import { persistedSignal } from "../../lib/persisted-signal";
import type { ActivityIconId } from "./icons";

/**
 * できごと (activity) のセッション状態 + localStorage 永続化。
 *
 * データ構造: 分単位の整数 (0..1439) → アイコン ID。1 分 1 アイコンまで (上書き、警告なし)。
 *
 * 内部の生 setter (setActivityRaw) は未 export。モジュール内でも生 setter を直接呼ばず必ず action
 * 経由で書き換える (= setActivityAt は受け取った minutes を整数に丸めて 0..1439 に正規化する
 * invariant を壊させない)。
 */

/** key = minutes (0..1439 の整数文字列), value = ActivityIconId */
export type Activity = { [minutes: number]: ActivityIconId };

/** 1 件のできごと (時刻 + アイコン)。activity をループしたい時に activityEvents() で取得。 */
export interface ActivityEvent {
  minutes: number;
  iconId: ActivityIconId;
}

const [activity, setActivityRaw] = persistedSignal<Activity>("activity", {});

export { activity };

/** 指定時刻 (分) のアイコン id を返す。無ければ undefined。 */
export const activityAt = (minutes: number): ActivityIconId | undefined =>
  activity()[Math.round(minutes)];

/** 全できごとを {minutes, iconId} の配列で返す (順序は insertion order)。 */
export const activityEvents = (): ActivityEvent[] =>
  Object.entries(activity()).map(([m, id]) => ({
    minutes: Number(m),
    iconId: id,
  }));

/** 指定時刻にアイコンを置く (既存があれば上書き、警告なし)。
 *  minutes は整数に丸めて 0..1439 に wrap-around してから保存する。 */
export const setActivityAt = (minutes: number, iconId: ActivityIconId) => {
  const snapped = ((Math.round(minutes) % 1440) + 1440) % 1440;
  setActivityRaw(s => ({ ...s, [snapped]: iconId }));
};

/** 指定時刻のアイコンを削除。無ければ no-op。 */
export const deleteActivityAt = (minutes: number) => {
  const snapped = ((Math.round(minutes) % 1440) + 1440) % 1440;
  setActivityRaw(s => {
    if (!(snapped in s)) return s;
    const { [snapped]: _removed, ...rest } = s;
    return rest;
  });
};

/** 全できごとを一括削除 (りせっと用)。 */
export const deleteAllActivity = () => {
  setActivityRaw({});
};
