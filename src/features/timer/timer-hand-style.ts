import type { MinuteHandStyle } from "../../components/clockface-layers/HandsLayer";

/**
 * タイマー盤の針の見た目を「終了時刻との関係」から決める表示ポリシー。汎用の針描画 (HandsLayer) からも
 * レイアウト (TimerLayout) からも切り離し、現在針 (長針 ghost) と done のオーバーラン針の色・不透明度を
 * ここ一箇所に集める。終了時刻との距離を色で語る三段:
 *   - まだうんと手前 (残り 60 分超): 薄青。盤面 1 周分以上あり、現在針が盤上で終了マーカーを追い越した側に
 *     見えるので、grey ghost のままだと「もう過ぎた」と誤読される。それを避ける「まだ先や」の合図。
 *   - 接近中 (残り 60 分以内): grey ghost (黒を薄く)。終了マーカー (不透明の黒) との対比で「今ここ」を控えめに。
 *   - 行き過ぎ (done): 薄赤。終了時刻を過ぎてからの経過を追うオーバーラン針 (TimerLayout が別の針として描く)。
 * 盤面に opacity 0.8 の色扇が乗る sector では針が色扇の上に乗るので明るめ、白盤 (badge / monotone) では
 * 白に溶けないよう少し濃いめ、と濃淡を 2 段に出し分ける (TimerWedge の nearColor と同じ思想)。純粋関数に
 * 保つため盤面種別は signal を読まず boolean (sectorBoard) で受け取り、判定は呼び出し側 (TimerLayout) が作る。
 */

/** 接近中 (残り 60 分以内) の現在針。黒を薄く載せた grey ghost。 */
const COUNTDOWN_STYLE: MinuteHandStyle = { color: "#111111", opacity: 0.2 };

/** まだうんと手前 (残り 60 分超) の現在針。grey ghost ではなく一本の薄青針として不透明で見せる。 */
const FAR_BEFORE_STYLE_SECTOR: MinuteHandStyle = { color: "#dbe8ff", opacity: 1 };
const FAR_BEFORE_STYLE_DEFAULT: MinuteHandStyle = { color: "#c8d6f3", opacity: 1 };

/** done のオーバーラン針の薄赤。 */
const OVERRUN_COLOR_SECTOR = "#ffdada";
const OVERRUN_COLOR_DEFAULT = "#f3c8c8";

/** 現在針が薄青に変わる残り時間しきい値 (秒)。これを超えると現在針が盤上で終了マーカーを追い越した側に来る。 */
const FAR_BEFORE_THRESHOLD_SECONDS = 60 * 60;

/** 現在針 (長針 ghost) の見た目。残り 60 分超なら薄青、以内なら grey ghost。 */
export const nowHandStyle = (remainingSeconds: number, sectorBoard: boolean): MinuteHandStyle => {
  if (remainingSeconds <= FAR_BEFORE_THRESHOLD_SECONDS) return COUNTDOWN_STYLE;
  return sectorBoard ? FAR_BEFORE_STYLE_SECTOR : FAR_BEFORE_STYLE_DEFAULT;
};

/** done のオーバーラン針の色 (扇の濃い端と同トーン)。 */
export const overrunHandColor = (sectorBoard: boolean): string =>
  sectorBoard ? OVERRUN_COLOR_SECTOR : OVERRUN_COLOR_DEFAULT;
