/**
 * 予定モードで使えるプリセットアイコン定義。子どもが日常で使う 12 種類で、順序は picker の表示順
 * (4 段 3 列で過不足なく埋まる)。差し替え / 追加は配列を編集するだけ。
 * ラベルは i18n キー (`schedule.icon.<id>`) で参照されるので src/i18n/resources/*.json 側に集約。
 */

export type ScheduleIconId =
  | "breakfast"
  | "lunch"
  | "dinner"
  | "study"
  | "pause"
  | "sleep"
  | "bath"
  | "brush"
  | "depart"
  | "play"
  | "music"
  | "special";

export interface ScheduleIconDef {
  id: ScheduleIconId;
  /** picker / 時計上の絵文字グリフ。 */
  emoji: string;
}

export const SCHEDULE_ICONS: readonly ScheduleIconDef[] = [
  { id: "breakfast", emoji: "🥐" }, // 朝食。クロワッサンはヨーロッパ枠。ただし形が三日月。
  { id: "lunch",     emoji: "🍙" }, // 昼食。日本発のプロダクトなので。日本、東アジア枠。
  { id: "dinner",    emoji: "🍔" }, // 夕食。アメリカ・グローバル枠。
  { id: "study",     emoji: "📖" }, // 学習や読書から宗教典籍まで含意できる万国シンボル。
  { id: "pause",     emoji: "☕" }, // 非西欧文化枠「食べる」ではなく「間を取る」時間の象徴で、茶 / チャイ / cha が「ふたとき」の哲学に合う。
  { id: "sleep",     emoji: "😪" }, // 子どもはお昼寝します。Siesta文化を兼用、夜の睡眠もこちらで対応できる。
  { id: "bath",      emoji: "🛁" }, // 入浴・シャワーの概念自体は万国に通じるはず。
  { id: "brush",     emoji: "🪥" }, // 近代衛生習慣として万国共通。お掃除、お片付けの時間としても使えそう。
  { id: "depart",    emoji: "🚪" }, // 当初の 🚌 (北米寄り) からドアに差し替えた。内部 id は departure 概念を意識して迷っていたままだったので、素直にドアに変更。
  { id: "play",      emoji: "⚽️" }, // 南米 / 欧州 / アフリカ / 中東いずれでも子供の外遊びの第一象徴として。
  { id: "music",     emoji: "🎵" }, // 万国共通。
  { id: "special",   emoji: "⭐️" }, // 自分や家族にとっての特別な時間を表す枠。誕生日・記念日・お祝いなど、子ども本人が意味を込めて使えるよう中立的にした。当初は 🕯 (静寂シンボル) だったが、ろうそくは宗教色が強く出るため避けて ⭐️ に変更。
];

const ICON_BY_ID: Record<ScheduleIconId, ScheduleIconDef> = Object.fromEntries(
  SCHEDULE_ICONS.map(def => [def.id, def]),
) as Record<ScheduleIconId, ScheduleIconDef>;

/** id から icon 定義を引く。存在しない id は undefined。 */
export const getScheduleIcon = (id: ScheduleIconId): ScheduleIconDef | undefined =>
  ICON_BY_ID[id];
