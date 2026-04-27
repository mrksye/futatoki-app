/**
 * 予定モードで使えるプリセットアイコン定義。子どもが日常で使う 11 種類で、順序は picker の表示順
 * (4 段 3 列、最後 1 マス空き)。差し替え / 追加は配列を編集するだけ。
 * ラベルは i18n キー (`schedule.icon.<id>`) で参照されるので src/i18n/resources/*.json 側に集約。
 */

export type ScheduleIconId =
  | "breakfast"
  | "lunch"
  | "dinner"
  | "snack"
  | "nap"
  | "sleep"
  | "wakeup"
  | "depart"
  | "bath"
  | "toothbrush"
  | "tidy";

export interface ScheduleIconDef {
  id: ScheduleIconId;
  /** picker / 時計上の絵文字グリフ。 */
  emoji: string;
}

export const SCHEDULE_ICONS: readonly ScheduleIconDef[] = [
  { id: "breakfast",  emoji: "🍳" },
  { id: "lunch",      emoji: "🍙" },
  { id: "dinner",     emoji: "🍔" },
  { id: "snack",      emoji: "🍰" },
  { id: "nap",        emoji: "😴" },
  { id: "sleep",      emoji: "🛌" },
  { id: "wakeup",     emoji: "☀️" },
  { id: "depart",     emoji: "🚌" },
  { id: "bath",       emoji: "🛁" },
  { id: "toothbrush", emoji: "🪥" },
  { id: "tidy",       emoji: "🧺" },
];

const ICON_BY_ID: Record<ScheduleIconId, ScheduleIconDef> = Object.fromEntries(
  SCHEDULE_ICONS.map(def => [def.id, def]),
) as Record<ScheduleIconId, ScheduleIconDef>;

/** id から icon 定義を引く。存在しない id は undefined。 */
export const getScheduleIcon = (id: ScheduleIconId): ScheduleIconDef | undefined =>
  ICON_BY_ID[id];
