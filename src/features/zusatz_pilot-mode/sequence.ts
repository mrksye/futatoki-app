/**
 * PilotMode (= 実験モード / ExperimentalMode) の解錠シーケンス。設定ポップオーバーの「配色」欄の
 * パレットボタンを、この id の順にタップすると解錠される。
 *
 * 合言葉「もも咲く朝、いそいそいそぐ」= 各パレット名の頭文字を並べたもの:
 *   も も さ く あ さ ／ い そ い そ い そ ぐ
 *     も = ものとーん (monotone)
 *     さ = さんげんしょく (3げんしょく = primary3)
 *     く = くっきりいろ (distinct12)
 *     あ = あおきみどり (ygb)
 *     い = いろのわ (wheel)
 *     そ = そらのいろ (vivid)
 *     ぐ ≒ く = くっきりいろ (distinct12)
 */
export const PILOT_SEQUENCE: readonly string[] = [
  "monotone",   // も
  "monotone",   // も
  "primary3",   // さ
  "distinct12", // く
  "ygb",        // あ
  "primary3",   // さ
  "wheel",      // い
  "vivid",      // そ
  "wheel",      // い
  "vivid",      // そ
  "wheel",      // い
  "vivid",      // そ
  "distinct12", // ぐ
];
