/**
 * # 天頂時刻ペアリング (noon pair)
 *
 * AM 0:00 (= 0 分) と PM 12:00 (= 720 分) は 12 時間制時計の天頂位置を共有する
 * 特殊な時刻ペア。視覚的に同じ位置を占めるのに、分単位の match 判定では
 * 12 時間離れた別物として扱われ、AM/PM 両レイヤーの片方だけポヨポヨして
 * もう片方が止まってる、という違和感が出る。
 *
 * このモジュールはその「天頂等価ルール」を 1 ヶ所に閉じ込めるための薄い helper:
 *   既存の match 判定関数を {@link withNoonPairing} で wrap すると、
 *   "片方が window 内 → 相方も match" として両側同時マッチが起きる。
 *
 * ## 削除しやすさ (粗結合)
 *
 * バグや仕様変更でこの等価ルールを撤去したくなった時は、
 *   1. このファイルを使っている import を消す
 *   2. wrap している 1 行を base 関数を直接代入する形に戻す
 * の 2 ステップで完全に dormant にできる。base 側のロジックには手を入れていない。
 */

const TWELVE_HOURS_IN_MINUTES = 720;

type MatchPredicate = (displayed: number, eventMinutes: number) => boolean;

/**
 * eventMinutes が天頂時刻 (0 / 720) ならその相方を返す。それ以外は null。
 * 天頂以外の時刻には等価ルールを適用しないので、対象を厳密に 2 値だけに絞る gate になっている。
 */
const noonPartner = (eventMinutes: number): number | null => {
  if (eventMinutes === 0) return TWELVE_HOURS_IN_MINUTES;
  if (eventMinutes === TWELVE_HOURS_IN_MINUTES) return 0;
  return null;
};

/**
 * 任意の "displayed と eventMinutes が match window 内か" 判定 base に天頂等価ルールを被せた
 * 新しい判定関数を返す高階関数。base のロジックは内部で 2 回しか呼ばれず、相方判定は noonPartner
 * を介する純粋な追加層。
 */
export const withNoonPairing = (base: MatchPredicate): MatchPredicate =>
  (displayed, eventMinutes) => {
    if (base(displayed, eventMinutes)) return true;
    const partner = noonPartner(eventMinutes);
    return partner !== null && base(displayed, partner);
  };
