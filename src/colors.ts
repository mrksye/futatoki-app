/**
 * カラーパレット集
 *
 * 新しいパレットを追加する場合は、下の `palettes` 配列に追加するだけでOK。
 * 各パレットは:
 *   - id: 永続化用の一意なキー（変更するとユーザーの保存設定が失われるので注意）
 *   - name: ボタン等に表示する名前
 *   - am: 0-11時（AM）の 12色
 *   - pm: 12-23時（PM）の 12色
 *
 * 各色は { bg, badge, text }:
 *   - bg:    扇形モードの背景色
 *   - badge: バッジ（すうじ）モードの円の色
 *   - text:  バッジモードの数字の色（背景とのコントラストを確保）
 */

export interface HourColor {
  bg: string;
  badge: string;
  text: string;
}

export interface Palette {
  id: string;
  name: string;
  am: HourColor[]; // length 12
  pm: HourColor[]; // length 12
}

// ===== パレット定義 =====
// 新しいパレットはここに足す。12+12=24色。

export const palettes: Palette[] = [
  // -------- ビビッド（Eric Carle風） --------
  {
    id: "vivid",
    name: "ビビッド",
    am: [
      // 深夜 (0-2): 深いインディゴ〜紫
      { bg: "#1B0A5C", badge: "#2A1080", text: "#ffffff" }, // 0時
      { bg: "#2E1578", badge: "#3D1E9E", text: "#ffffff" }, // 1時
      { bg: "#4A2090", badge: "#6030B0", text: "#ffffff" }, // 2時
      // 明け方 (3-5): 鮮烈な朝焼け
      { bg: "#D81848", badge: "#E82058", text: "#ffffff" }, // 3時
      { bg: "#F06010", badge: "#F87020", text: "#ffffff" }, // 4時
      { bg: "#F8C800", badge: "#FFD500", text: "#1a1a1a" }, // 5時
      // 朝 (6-8): 鮮やかな自然の緑
      { bg: "#88C800", badge: "#98D810", text: "#1a1a1a" }, // 6時
      { bg: "#009848", badge: "#00B058", text: "#ffffff" }, // 7時
      { bg: "#008068", badge: "#009878", text: "#ffffff" }, // 8時
      // 午前 (9-11): 力強い青空
      { bg: "#0098D8", badge: "#00A8E8", text: "#ffffff" }, // 9時
      { bg: "#0070C0", badge: "#0080D0", text: "#ffffff" }, // 10時
      { bg: "#0050A0", badge: "#0060B8", text: "#ffffff" }, // 11時
    ],
    pm: [
      // 昼下がり (12-14): 太陽の色
      { bg: "#F8B800", badge: "#FFC810", text: "#1a1a1a" }, // 12時
      { bg: "#F09800", badge: "#F8A810", text: "#1a1a1a" }, // 13時
      { bg: "#E87800", badge: "#F08808", text: "#ffffff" }, // 14時
      // 夕方 (15-17): 夕焼けの赤
      { bg: "#E05000", badge: "#E86010", text: "#ffffff" }, // 15時
      { bg: "#D02020", badge: "#E03030", text: "#ffffff" }, // 16時
      { bg: "#B01850", badge: "#C82060", text: "#ffffff" }, // 17時
      // 夜の入り (18-20): たそがれの紫
      { bg: "#8818A0", badge: "#9820B0", text: "#ffffff" }, // 18時
      { bg: "#6018A0", badge: "#7028B0", text: "#ffffff" }, // 19時
      { bg: "#401890", badge: "#502098", text: "#ffffff" }, // 20時
      // 夜 (21-23): 夜空
      { bg: "#281070", badge: "#381880", text: "#ffffff" }, // 21時
      { bg: "#1C0C58", badge: "#281068", text: "#ffffff" }, // 22時
      { bg: "#100840", badge: "#1C1058", text: "#ffffff" }, // 23時
    ],
  },

  // -------- パステル（やわらかい色合い） --------
  {
    id: "pastel",
    name: "パステル",
    am: [
      { bg: "#5C4F82", badge: "#6F5F9A", text: "#ffffff" }, // 0時
      { bg: "#7D67A5", badge: "#8F78B8", text: "#ffffff" }, // 1時
      { bg: "#A090C8", badge: "#B0A0D4", text: "#ffffff" }, // 2時
      { bg: "#E8A8B8", badge: "#F0B8C4", text: "#4a2530" }, // 3時
      { bg: "#F4C4A0", badge: "#F8D0B0", text: "#4a2510" }, // 4時
      { bg: "#F4DC90", badge: "#F8E4A0", text: "#4a3510" }, // 5時
      { bg: "#C8E098", badge: "#D4E8A8", text: "#2a4a10" }, // 6時
      { bg: "#A8D8A8", badge: "#B8E0B8", text: "#204020" }, // 7時
      { bg: "#A0D8C8", badge: "#B0E0D0", text: "#1a3a35" }, // 8時
      { bg: "#A8D0E8", badge: "#B8D8F0", text: "#1a3550" }, // 9時
      { bg: "#90B8E0", badge: "#A0C8E8", text: "#1a3050" }, // 10時
      { bg: "#9C9CD0", badge: "#ACACD8", text: "#25254a" }, // 11時
    ],
    pm: [
      { bg: "#F4D8A0", badge: "#F8E0B0", text: "#4a3510" }, // 12時
      { bg: "#F4C888", badge: "#F8D098", text: "#4a2810" }, // 13時
      { bg: "#F4B080", badge: "#F8C090", text: "#4a2010" }, // 14時
      { bg: "#F0A080", badge: "#F4B090", text: "#4a1815" }, // 15時
      { bg: "#EC9898", badge: "#F0A8A8", text: "#4a1818" }, // 16時
      { bg: "#ECA0B0", badge: "#F0B0C0", text: "#4a152a" }, // 17時
      { bg: "#D498C0", badge: "#DCA8CC", text: "#3a154a" }, // 18時
      { bg: "#B494C4", badge: "#C0A4D0", text: "#30154a" }, // 19時
      { bg: "#9484AC", badge: "#A094B8", text: "#ffffff" }, // 20時
      { bg: "#746C94", badge: "#807CA0", text: "#ffffff" }, // 21時
      { bg: "#5C547C", badge: "#686490", text: "#ffffff" }, // 22時
      { bg: "#4A4260", badge: "#5A5272", text: "#ffffff" }, // 23時
    ],
  },

  // -------- 3色ループ（1,2,3 = 黄,緑,青 の繰り返し） --------
  // hour mod 3 == 1 → 黄 / == 2 → 緑 / == 0 → 青（3,6,9,12）
  {
    id: "ygb",
    name: "3色ループ",
    am: [
      { bg: "#0080D8", badge: "#0098E8", text: "#ffffff" }, // 0時(12) 青
      { bg: "#F4C800", badge: "#FFD400", text: "#1a1a1a" }, // 1時  黄
      { bg: "#00A048", badge: "#00B858", text: "#ffffff" }, // 2時  緑
      { bg: "#0080D8", badge: "#0098E8", text: "#ffffff" }, // 3時  青
      { bg: "#F4C800", badge: "#FFD400", text: "#1a1a1a" }, // 4時  黄
      { bg: "#00A048", badge: "#00B858", text: "#ffffff" }, // 5時  緑
      { bg: "#0080D8", badge: "#0098E8", text: "#ffffff" }, // 6時  青
      { bg: "#F4C800", badge: "#FFD400", text: "#1a1a1a" }, // 7時  黄
      { bg: "#00A048", badge: "#00B858", text: "#ffffff" }, // 8時  緑
      { bg: "#0080D8", badge: "#0098E8", text: "#ffffff" }, // 9時  青
      { bg: "#F4C800", badge: "#FFD400", text: "#1a1a1a" }, // 10時 黄
      { bg: "#00A048", badge: "#00B858", text: "#ffffff" }, // 11時 緑
    ],
    pm: [
      { bg: "#0080D8", badge: "#0098E8", text: "#ffffff" }, // 12時 青
      { bg: "#F4C800", badge: "#FFD400", text: "#1a1a1a" }, // 13時 黄
      { bg: "#00A048", badge: "#00B858", text: "#ffffff" }, // 14時 緑
      { bg: "#0080D8", badge: "#0098E8", text: "#ffffff" }, // 15時 青
      { bg: "#F4C800", badge: "#FFD400", text: "#1a1a1a" }, // 16時 黄
      { bg: "#00A048", badge: "#00B858", text: "#ffffff" }, // 17時 緑
      { bg: "#0080D8", badge: "#0098E8", text: "#ffffff" }, // 18時 青
      { bg: "#F4C800", badge: "#FFD400", text: "#1a1a1a" }, // 19時 黄
      { bg: "#00A048", badge: "#00B858", text: "#ffffff" }, // 20時 緑
      { bg: "#0080D8", badge: "#0098E8", text: "#ffffff" }, // 21時 青
      { bg: "#F4C800", badge: "#FFD400", text: "#1a1a1a" }, // 22時 黄
      { bg: "#00A048", badge: "#00B858", text: "#ffffff" }, // 23時 緑
    ],
  },

  // -------- 3色ループ うすめ（黄・緑・青のやさしいトーン） --------
  {
    id: "ygb-soft",
    name: "3色ループ うすめ",
    am: [
      { bg: "#A8C8E8", badge: "#B8D4F0", text: "#1a3550" }, // 0時(12) 青
      { bg: "#FDE088", badge: "#FFE8A0", text: "#5A4010" }, // 1時  黄
      { bg: "#A8D8B8", badge: "#B8E0C4", text: "#1a3a20" }, // 2時  緑
      { bg: "#A8C8E8", badge: "#B8D4F0", text: "#1a3550" }, // 3時  青
      { bg: "#FDE088", badge: "#FFE8A0", text: "#5A4010" }, // 4時  黄
      { bg: "#A8D8B8", badge: "#B8E0C4", text: "#1a3a20" }, // 5時  緑
      { bg: "#A8C8E8", badge: "#B8D4F0", text: "#1a3550" }, // 6時  青
      { bg: "#FDE088", badge: "#FFE8A0", text: "#5A4010" }, // 7時  黄
      { bg: "#A8D8B8", badge: "#B8E0C4", text: "#1a3a20" }, // 8時  緑
      { bg: "#A8C8E8", badge: "#B8D4F0", text: "#1a3550" }, // 9時  青
      { bg: "#FDE088", badge: "#FFE8A0", text: "#5A4010" }, // 10時 黄
      { bg: "#A8D8B8", badge: "#B8E0C4", text: "#1a3a20" }, // 11時 緑
    ],
    pm: [
      { bg: "#A8C8E8", badge: "#B8D4F0", text: "#1a3550" }, // 12時 青
      { bg: "#FDE088", badge: "#FFE8A0", text: "#5A4010" }, // 13時 黄
      { bg: "#A8D8B8", badge: "#B8E0C4", text: "#1a3a20" }, // 14時 緑
      { bg: "#A8C8E8", badge: "#B8D4F0", text: "#1a3550" }, // 15時 青
      { bg: "#FDE088", badge: "#FFE8A0", text: "#5A4010" }, // 16時 黄
      { bg: "#A8D8B8", badge: "#B8E0C4", text: "#1a3a20" }, // 17時 緑
      { bg: "#A8C8E8", badge: "#B8D4F0", text: "#1a3550" }, // 18時 青
      { bg: "#FDE088", badge: "#FFE8A0", text: "#5A4010" }, // 19時 黄
      { bg: "#A8D8B8", badge: "#B8E0C4", text: "#1a3a20" }, // 20時 緑
      { bg: "#A8C8E8", badge: "#B8D4F0", text: "#1a3550" }, // 21時 青
      { bg: "#FDE088", badge: "#FFE8A0", text: "#5A4010" }, // 22時 黄
      { bg: "#A8D8B8", badge: "#B8E0C4", text: "#1a3a20" }, // 23時 緑
    ],
  },

  // -------- いろのわ（色相環・Itten 12色） --------
  // 設計: ヨハネス・イッテンの12色相環を時計の位置に対応させる。
  //   時計の12 = 色相環の頂点(黄)。時計の節目(3,6,9,12)が色相環の節目と揃うので、
  //   子どもが時計を見るたびに自然と色相の並びを覚えられる構造。
  //   原色(黄・赤・青) = 12時, 4時, 8時 / 二次色(橙・紫・緑) = 2時, 6時, 10時
  //   対角に来る色は補色関係（12時⇔6時, 3時⇔9時 など）。
  //   AM/PMは同色（色相環は時間帯に依存しない普遍的な構造なので）。
  {
    id: "wheel",
    name: "いろのわ",
    am: [
      { bg: "#F4D800", badge: "#FFE010", text: "#1a1a1a" }, // 0時(12) 黄
      { bg: "#F4A820", badge: "#FFB830", text: "#1a1a1a" }, // 1時  黄橙
      { bg: "#ED7810", badge: "#FA8820", text: "#ffffff" }, // 2時  橙
      { bg: "#E04820", badge: "#F05830", text: "#ffffff" }, // 3時  赤橙
      { bg: "#D82030", badge: "#E83040", text: "#ffffff" }, // 4時  赤
      { bg: "#C82078", badge: "#D83088", text: "#ffffff" }, // 5時  赤紫
      { bg: "#8830B8", badge: "#9838C8", text: "#ffffff" }, // 6時  紫
      { bg: "#5028B8", badge: "#6030C8", text: "#ffffff" }, // 7時  青紫
      { bg: "#1848C0", badge: "#2858D0", text: "#ffffff" }, // 8時  青
      { bg: "#0890B0", badge: "#18A0C0", text: "#ffffff" }, // 9時  青緑
      { bg: "#18A040", badge: "#28B050", text: "#ffffff" }, // 10時 緑
      { bg: "#80C020", badge: "#90D030", text: "#1a1a1a" }, // 11時 黄緑
    ],
    pm: [
      { bg: "#F4D800", badge: "#FFE010", text: "#1a1a1a" }, // 12時 黄
      { bg: "#F4A820", badge: "#FFB830", text: "#1a1a1a" }, // 13時 黄橙
      { bg: "#ED7810", badge: "#FA8820", text: "#ffffff" }, // 14時 橙
      { bg: "#E04820", badge: "#F05830", text: "#ffffff" }, // 15時 赤橙
      { bg: "#D82030", badge: "#E83040", text: "#ffffff" }, // 16時 赤
      { bg: "#C82078", badge: "#D83088", text: "#ffffff" }, // 17時 赤紫
      { bg: "#8830B8", badge: "#9838C8", text: "#ffffff" }, // 18時 紫
      { bg: "#5028B8", badge: "#6030C8", text: "#ffffff" }, // 19時 青紫
      { bg: "#1848C0", badge: "#2858D0", text: "#ffffff" }, // 20時 青
      { bg: "#0890B0", badge: "#18A0C0", text: "#ffffff" }, // 21時 青緑
      { bg: "#18A040", badge: "#28B050", text: "#ffffff" }, // 22時 緑
      { bg: "#80C020", badge: "#90D030", text: "#1a1a1a" }, // 23時 黄緑
    ],
  },

  // -------- いろのわ うすめ（色相環のパステル版） --------
  {
    id: "wheel-soft",
    name: "いろのわ うすめ",
    am: [
      { bg: "#FCEB88", badge: "#FFF1A0", text: "#5A4410" }, // 0時(12) 黄
      { bg: "#FCD890", badge: "#FFE0A8", text: "#5A3510" }, // 1時  黄橙
      { bg: "#F8C090", badge: "#FFD0A0", text: "#5A2510" }, // 2時  橙
      { bg: "#F4A898", badge: "#FCB8A8", text: "#5A2018" }, // 3時  赤橙
      { bg: "#F0A0A8", badge: "#F8B0B8", text: "#5A1820" }, // 4時  赤
      { bg: "#E8A0C0", badge: "#F0B0CC", text: "#5A1840" }, // 5時  赤紫
      { bg: "#C898D8", badge: "#D4A8E0", text: "#35154A" }, // 6時  紫
      { bg: "#A898D8", badge: "#B4A8E0", text: "#25154A" }, // 7時  青紫
      { bg: "#98B0E0", badge: "#A8BCE8", text: "#152040" }, // 8時  青
      { bg: "#90C8D8", badge: "#A0D0E0", text: "#103040" }, // 9時  青緑
      { bg: "#A0D4A8", badge: "#B0DCB8", text: "#1a3a20" }, // 10時 緑
      { bg: "#C4D890", badge: "#CCE0A0", text: "#2A3810" }, // 11時 黄緑
    ],
    pm: [
      { bg: "#FCEB88", badge: "#FFF1A0", text: "#5A4410" }, // 12時 黄
      { bg: "#FCD890", badge: "#FFE0A8", text: "#5A3510" }, // 13時 黄橙
      { bg: "#F8C090", badge: "#FFD0A0", text: "#5A2510" }, // 14時 橙
      { bg: "#F4A898", badge: "#FCB8A8", text: "#5A2018" }, // 15時 赤橙
      { bg: "#F0A0A8", badge: "#F8B0B8", text: "#5A1820" }, // 16時 赤
      { bg: "#E8A0C0", badge: "#F0B0CC", text: "#5A1840" }, // 17時 赤紫
      { bg: "#C898D8", badge: "#D4A8E0", text: "#35154A" }, // 18時 紫
      { bg: "#A898D8", badge: "#B4A8E0", text: "#25154A" }, // 19時 青紫
      { bg: "#98B0E0", badge: "#A8BCE8", text: "#152040" }, // 20時 青
      { bg: "#90C8D8", badge: "#A0D0E0", text: "#103040" }, // 21時 青緑
      { bg: "#A0D4A8", badge: "#B0DCB8", text: "#1a3a20" }, // 22時 緑
      { bg: "#C4D890", badge: "#CCE0A0", text: "#2A3810" }, // 23時 黄緑
    ],
  },

  // -------- 3げんしょく（色の三原色: 赤・黄・青のループ） --------
  // 絵の具の三原色(RYB)を時計に配置。既存「3色ループ」(黄緑青)との違いは
  // "緑"を抜き"赤"を入れた点。原色だけで構成される最古典的な教材配色。
  // hour mod 3 == 1 → 赤 / == 2 → 黄 / == 0 → 青（3,6,9,12）
  {
    id: "primary3",
    name: "3げんしょく",
    am: [
      { bg: "#0070C8", badge: "#0080D8", text: "#ffffff" }, // 0時(12) 青
      { bg: "#D82030", badge: "#E83040", text: "#ffffff" }, // 1時  赤
      { bg: "#F4C800", badge: "#FFD400", text: "#1a1a1a" }, // 2時  黄
      { bg: "#0070C8", badge: "#0080D8", text: "#ffffff" }, // 3時  青
      { bg: "#D82030", badge: "#E83040", text: "#ffffff" }, // 4時  赤
      { bg: "#F4C800", badge: "#FFD400", text: "#1a1a1a" }, // 5時  黄
      { bg: "#0070C8", badge: "#0080D8", text: "#ffffff" }, // 6時  青
      { bg: "#D82030", badge: "#E83040", text: "#ffffff" }, // 7時  赤
      { bg: "#F4C800", badge: "#FFD400", text: "#1a1a1a" }, // 8時  黄
      { bg: "#0070C8", badge: "#0080D8", text: "#ffffff" }, // 9時  青
      { bg: "#D82030", badge: "#E83040", text: "#ffffff" }, // 10時 赤
      { bg: "#F4C800", badge: "#FFD400", text: "#1a1a1a" }, // 11時 黄
    ],
    pm: [
      { bg: "#0070C8", badge: "#0080D8", text: "#ffffff" }, // 12時 青
      { bg: "#D82030", badge: "#E83040", text: "#ffffff" }, // 13時 赤
      { bg: "#F4C800", badge: "#FFD400", text: "#1a1a1a" }, // 14時 黄
      { bg: "#0070C8", badge: "#0080D8", text: "#ffffff" }, // 15時 青
      { bg: "#D82030", badge: "#E83040", text: "#ffffff" }, // 16時 赤
      { bg: "#F4C800", badge: "#FFD400", text: "#1a1a1a" }, // 17時 黄
      { bg: "#0070C8", badge: "#0080D8", text: "#ffffff" }, // 18時 青
      { bg: "#D82030", badge: "#E83040", text: "#ffffff" }, // 19時 赤
      { bg: "#F4C800", badge: "#FFD400", text: "#1a1a1a" }, // 20時 黄
      { bg: "#0070C8", badge: "#0080D8", text: "#ffffff" }, // 21時 青
      { bg: "#D82030", badge: "#E83040", text: "#ffffff" }, // 22時 赤
      { bg: "#F4C800", badge: "#FFD400", text: "#1a1a1a" }, // 23時 黄
    ],
  },

  // -------- 3げんしょく うすめ（三原色のパステル版） --------
  {
    id: "primary3-soft",
    name: "3げんしょく うすめ",
    am: [
      { bg: "#A8C0E8", badge: "#B8D0F0", text: "#1a3550" }, // 0時(12) 青
      { bg: "#F0A8B0", badge: "#F8B8C0", text: "#5A1820" }, // 1時  赤
      { bg: "#FDE088", badge: "#FFE8A0", text: "#5A4010" }, // 2時  黄
      { bg: "#A8C0E8", badge: "#B8D0F0", text: "#1a3550" }, // 3時  青
      { bg: "#F0A8B0", badge: "#F8B8C0", text: "#5A1820" }, // 4時  赤
      { bg: "#FDE088", badge: "#FFE8A0", text: "#5A4010" }, // 5時  黄
      { bg: "#A8C0E8", badge: "#B8D0F0", text: "#1a3550" }, // 6時  青
      { bg: "#F0A8B0", badge: "#F8B8C0", text: "#5A1820" }, // 7時  赤
      { bg: "#FDE088", badge: "#FFE8A0", text: "#5A4010" }, // 8時  黄
      { bg: "#A8C0E8", badge: "#B8D0F0", text: "#1a3550" }, // 9時  青
      { bg: "#F0A8B0", badge: "#F8B8C0", text: "#5A1820" }, // 10時 赤
      { bg: "#FDE088", badge: "#FFE8A0", text: "#5A4010" }, // 11時 黄
    ],
    pm: [
      { bg: "#A8C0E8", badge: "#B8D0F0", text: "#1a3550" }, // 12時 青
      { bg: "#F0A8B0", badge: "#F8B8C0", text: "#5A1820" }, // 13時 赤
      { bg: "#FDE088", badge: "#FFE8A0", text: "#5A4010" }, // 14時 黄
      { bg: "#A8C0E8", badge: "#B8D0F0", text: "#1a3550" }, // 15時 青
      { bg: "#F0A8B0", badge: "#F8B8C0", text: "#5A1820" }, // 16時 赤
      { bg: "#FDE088", badge: "#FFE8A0", text: "#5A4010" }, // 17時 黄
      { bg: "#A8C0E8", badge: "#B8D0F0", text: "#1a3550" }, // 18時 青
      { bg: "#F0A8B0", badge: "#F8B8C0", text: "#5A1820" }, // 19時 赤
      { bg: "#FDE088", badge: "#FFE8A0", text: "#5A4010" }, // 20時 黄
      { bg: "#A8C0E8", badge: "#B8D0F0", text: "#1a3550" }, // 21時 青
      { bg: "#F0A8B0", badge: "#F8B8C0", text: "#5A1820" }, // 22時 赤
      { bg: "#FDE088", badge: "#FFE8A0", text: "#5A4010" }, // 23時 黄
    ],
  },

  // -------- くっきり12（1時間ごとに色相・寒暖・明度を交互ジャンプ） --------
  // 設計: 隣接する時間が最大限に識別できるよう、寒暖・色相を意図的に飛ばす。
  // グラデーションにならないカテゴリカル配色（Glasbey思想）。
  // 色覚多様性への配慮もあり、赤↔緑の直接隣接は避けている。
  {
    id: "distinct12",
    name: "くっきり12",
    am: [
      { bg: "#DC2040", badge: "#E83050", text: "#ffffff" }, // 0時(12) 赤
      { bg: "#20A0A8", badge: "#30B0B8", text: "#ffffff" }, // 1時  ティール
      { bg: "#F4C800", badge: "#FFD400", text: "#1a1a1a" }, // 2時  黄
      { bg: "#9020B0", badge: "#A030C0", text: "#ffffff" }, // 3時  紫
      { bg: "#F08020", badge: "#FA9030", text: "#ffffff" }, // 4時  橙
      { bg: "#2060C8", badge: "#3070D8", text: "#ffffff" }, // 5時  青
      { bg: "#F880A8", badge: "#FF90B8", text: "#4a1820" }, // 6時  ピンク
      { bg: "#30A048", badge: "#40B058", text: "#ffffff" }, // 7時  緑
      { bg: "#A0602A", badge: "#B0703A", text: "#ffffff" }, // 8時  茶
      { bg: "#60B0E0", badge: "#70C0F0", text: "#1a2040" }, // 9時  水色
      { bg: "#E040A0", badge: "#F050B0", text: "#ffffff" }, // 10時 マゼンタ
      { bg: "#A0C020", badge: "#B0D030", text: "#1a1a1a" }, // 11時 黄緑
    ],
    pm: [
      { bg: "#DC2040", badge: "#E83050", text: "#ffffff" }, // 12時 赤
      { bg: "#20A0A8", badge: "#30B0B8", text: "#ffffff" }, // 13時 ティール
      { bg: "#F4C800", badge: "#FFD400", text: "#1a1a1a" }, // 14時 黄
      { bg: "#9020B0", badge: "#A030C0", text: "#ffffff" }, // 15時 紫
      { bg: "#F08020", badge: "#FA9030", text: "#ffffff" }, // 16時 橙
      { bg: "#2060C8", badge: "#3070D8", text: "#ffffff" }, // 17時 青
      { bg: "#F880A8", badge: "#FF90B8", text: "#4a1820" }, // 18時 ピンク
      { bg: "#30A048", badge: "#40B058", text: "#ffffff" }, // 19時 緑
      { bg: "#A0602A", badge: "#B0703A", text: "#ffffff" }, // 20時 茶
      { bg: "#60B0E0", badge: "#70C0F0", text: "#1a2040" }, // 21時 水色
      { bg: "#E040A0", badge: "#F050B0", text: "#ffffff" }, // 22時 マゼンタ
      { bg: "#A0C020", badge: "#B0D030", text: "#1a1a1a" }, // 23時 黄緑
    ],
  },

  // -------- くっきり12 うすめ（12色カテゴリカルのパステル版） --------
  {
    id: "distinct12-soft",
    name: "くっきり12 うすめ",
    am: [
      { bg: "#F0A8B8", badge: "#F8B8C4", text: "#5A1820" }, // 0時(12) 赤
      { bg: "#A8D8D8", badge: "#B8E0E0", text: "#103040" }, // 1時  ティール
      { bg: "#FCE888", badge: "#FFF0A0", text: "#5A4410" }, // 2時  黄
      { bg: "#D0A8E0", badge: "#DCB8E8", text: "#35154A" }, // 3時  紫
      { bg: "#FCC090", badge: "#FFD0A0", text: "#5A2510" }, // 4時  橙
      { bg: "#A8C0E8", badge: "#B8D0F0", text: "#15254A" }, // 5時  青
      { bg: "#FCB8C8", badge: "#FFC8D4", text: "#5A152A" }, // 6時  ピンク
      { bg: "#A8D4A8", badge: "#B8DCB8", text: "#1a3a20" }, // 7時  緑
      { bg: "#D8B090", badge: "#E0BCA0", text: "#402810" }, // 8時  茶
      { bg: "#C0D8F0", badge: "#CCE0F4", text: "#1a3550" }, // 9時  水色
      { bg: "#E8A8C8", badge: "#F0B8D0", text: "#4A1840" }, // 10時 マゼンタ
      { bg: "#CCD888", badge: "#D4E0A0", text: "#2A3810" }, // 11時 黄緑
    ],
    pm: [
      { bg: "#F0A8B8", badge: "#F8B8C4", text: "#5A1820" }, // 12時 赤
      { bg: "#A8D8D8", badge: "#B8E0E0", text: "#103040" }, // 13時 ティール
      { bg: "#FCE888", badge: "#FFF0A0", text: "#5A4410" }, // 14時 黄
      { bg: "#D0A8E0", badge: "#DCB8E8", text: "#35154A" }, // 15時 紫
      { bg: "#FCC090", badge: "#FFD0A0", text: "#5A2510" }, // 16時 橙
      { bg: "#A8C0E8", badge: "#B8D0F0", text: "#15254A" }, // 17時 青
      { bg: "#FCB8C8", badge: "#FFC8D4", text: "#5A152A" }, // 18時 ピンク
      { bg: "#A8D4A8", badge: "#B8DCB8", text: "#1a3a20" }, // 19時 緑
      { bg: "#D8B090", badge: "#E0BCA0", text: "#402810" }, // 20時 茶
      { bg: "#C0D8F0", badge: "#CCE0F4", text: "#1a3550" }, // 21時 水色
      { bg: "#E8A8C8", badge: "#F0B8D0", text: "#4A1840" }, // 22時 マゼンタ
      { bg: "#CCD888", badge: "#D4E0A0", text: "#2A3810" }, // 23時 黄緑
    ],
  },
];

// ===== ルックアップ =====

export const DEFAULT_PALETTE_ID = palettes[0]!.id;

export function getPalette(id: string): Palette {
  return palettes.find((p) => p.id === id) ?? palettes[0]!;
}

export function getAmColor(palette: Palette, hour: number): HourColor {
  return palette.am[hour % 12]!;
}

export function getPmColor(palette: Palette, hour: number): HourColor {
  return palette.pm[hour % 12]!;
}

export function getHourColor(palette: Palette, hour24: number): HourColor {
  return hour24 < 12 ? getAmColor(palette, hour24) : getPmColor(palette, hour24);
}
