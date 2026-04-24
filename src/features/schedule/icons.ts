/**
 * 予定モードで使えるプリセットアイコン定義。
 *
 * Public API:
 *   - ScheduleIconId  (id の union 型)
 *   - SCHEDULE_ICONS  (id → emoji + label のマッピング配列)
 *   - getScheduleIcon (id から定義を引く)
 *
 * 子どもが日常で使う 11 種類。順序は picker の表示順 (4段3列、最後1マス空き)。
 *
 * 将来「ユーザーがアイコンを追加」する機能を入れる時はこの配列を拡張可能にする
 * 想定だが、現時点ではプリセット固定。差し替え/追加は配列を編集するだけ。
 *
 * label は将来 i18n 対象になる可能性が高いので、ID とは別に保持。
 * aria-label TODO もこのラベルを起点にする想定。
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
  /** picker / 時計上の絵文字グリフ */
  emoji: string;
}

/**
 * ラベル文字列は i18n キー (`schedule.icon.<id>`) で参照する。
 * このファイルは絵文字の見た目だけを持ち、ラベル翻訳は src/i18n/resources/*.json 側に集約。
 */
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
