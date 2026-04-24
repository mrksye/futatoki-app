/**
 * カラーパレット集
 *
 * 新しいパレットを追加する場合は、下の `palettes` 配列に追加するだけでOK。
 * 各パレットは:
 *   - id: 永続化用 & i18n キー参照用の一意なキー（変更するとユーザーの保存設定と翻訳参照が失われるので注意）
 *   - am: 0-11時（AM）の 12色
 *   - pm: 12-23時（PM）の 12色
 *
 * 各色は { bg, badge, text }:
 *   - bg:    扇形モードの背景色
 *   - badge: バッジモードの円の色
 *   - text:  バッジモードの数字の色（背景とのコントラストを確保）
 *
 * 表示名は src/i18n/resources/*.json の `palette.{id}` キーで参照する。
 */

export interface HourColor {
  bg: string;
  badge: string;
  text: string;
}

export interface Palette {
  id: string;
  am: HourColor[]; // length 12
  pm: HourColor[]; // length 12
}

// ===== パレット定義 =====
// 配列の先頭が初期値。順序は「べつのいろ」ボタンの循環順になる。

export const palettes: Palette[] = [
  // -------- くっきりいろ（1時間ごとに色相・寒暖・明度を交互ジャンプ） --------
  // 設計: 隣接時間が最大限に識別できるよう、寒暖・色相を意図的に飛ばす。
  // グラデーションにならないカテゴリカル配色（Glasbey思想）。
  // 色覚多様性に配慮し、赤↔緑の直接隣接は避けている。
  // ※ 初期設定パレット
  {
    id: "distinct12",
    am: [
      { bg: "#DC2040", badge: "#E83050", text: "#ffffff" }, // 0時(12) 赤
      { bg: "#20A0A8", badge: "#30B0B8", text: "#ffffff" }, // 1時  ティール
      { bg: "#F4C800", badge: "#FFD400", text: "#1a1a1a" }, // 2時  黄
      { bg: "#9020B0", badge: "#A030C0", text: "#ffffff" }, // 3時  紫
      { bg: "#F08020", badge: "#FA9030", text: "#ffffff" }, // 4時  橙
      { bg: "#2060C8", badge: "#3070D8", text: "#ffffff" }, // 5時  青
      { bg: "#F8A0B0", badge: "#FFB0C0", text: "#4a1820" }, // 6時  ピンク
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
      { bg: "#F8A0B0", badge: "#FFB0C0", text: "#4a1820" }, // 18時 ピンク
      { bg: "#30A048", badge: "#40B058", text: "#ffffff" }, // 19時 緑
      { bg: "#A0602A", badge: "#B0703A", text: "#ffffff" }, // 20時 茶
      { bg: "#60B0E0", badge: "#70C0F0", text: "#1a2040" }, // 21時 水色
      { bg: "#E040A0", badge: "#F050B0", text: "#ffffff" }, // 22時 マゼンタ
      { bg: "#A0C020", badge: "#B0D030", text: "#1a1a1a" }, // 23時 黄緑
    ],
  },

  // -------- そらのいろ（時刻ごとの空の色を辿る） --------
  // 日本語の空の色彩語に基づく配色:
  //   深夜→夜明け前→薄明→暁(あけぼの)→朝焼け→朝の金色→朝の青空→真昼→
  //   午後の空→黄金の空(ゴールデンアワー)→夕焼け→黄昏→宵→夜。
  // 緑や黄色の"自然色"を排し、すべて空に見える色で構成。
  {
    id: "vivid",
    am: [
      { bg: "#0A0A28", badge: "#141438", text: "#ffffff" }, // 0時  深い夜
      { bg: "#101038", badge: "#18184C", text: "#ffffff" }, // 1時  深夜
      { bg: "#1C1C58", badge: "#242470", text: "#ffffff" }, // 2時  夜明け前
      { bg: "#2C2870", badge: "#383488", text: "#ffffff" }, // 3時  暁の入口
      { bg: "#5840A0", badge: "#6848B8", text: "#ffffff" }, // 4時  薄明
      { bg: "#B04888", badge: "#C0589C", text: "#ffffff" }, // 5時  暁(あけぼの)
      { bg: "#F06048", badge: "#FF7058", text: "#ffffff" }, // 6時  朝焼け
      { bg: "#F48858", badge: "#FF9868", text: "#ffffff" }, // 7時  朝焼け明るい
      { bg: "#F4B868", badge: "#FFC880", text: "#1a1a1a" }, // 8時  朝の金色
      { bg: "#78C0E8", badge: "#88D0F0", text: "#1a2a40" }, // 9時  朝の青空
      { bg: "#3898E8", badge: "#48A8F0", text: "#ffffff" }, // 10時 青空
      { bg: "#1080E0", badge: "#2090F0", text: "#ffffff" }, // 11時 青空深まる
    ],
    pm: [
      { bg: "#0878D8", badge: "#1888E8", text: "#ffffff" }, // 12時 真昼の空
      { bg: "#3090E0", badge: "#40A0E8", text: "#ffffff" }, // 13時 午後の空
      { bg: "#5098D8", badge: "#60A8E0", text: "#ffffff" }, // 14時 午後の空
      { bg: "#4CC8DC", badge: "#5CD8EC", text: "#0E3848" }, // 15時 すみきった午後
      { bg: "#F09848", badge: "#FFA858", text: "#ffffff" }, // 16時 黄金の空
      { bg: "#E84820", badge: "#F05830", text: "#ffffff" }, // 17時 夕焼け
      { bg: "#C02048", badge: "#D03058", text: "#ffffff" }, // 18時 夕焼け深まる
      { bg: "#802868", badge: "#903878", text: "#ffffff" }, // 19時 黄昏(たそがれ)
      { bg: "#402888", badge: "#4C30A0", text: "#ffffff" }, // 20時 宵の紫
      { bg: "#1C1858", badge: "#242460", text: "#ffffff" }, // 21時 夜
      { bg: "#0C0830", badge: "#14103C", text: "#ffffff" }, // 22時 夜深まる
      { bg: "#080820", badge: "#121228", text: "#ffffff" }, // 23時 真夜中前
    ],
  },

  // -------- あおきみどり（黄・緑・青の3色ループ） --------
  // hour mod 3 == 1 → 黄 / == 2 → 緑 / == 0 → 青（3,6,9,12）
  {
    id: "ygb",
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

  // -------- さんげんしょく（色の三原色: シアン・マゼンタ・イエローのループ） --------
  // CMYに近い鮮やかさを残しつつ、ほんの少しだけトーンを抑えた中間。
  // hour mod 3 == 1 → マゼンタ / == 2 → イエロー / == 0 → シアン（3,6,9,12）
  {
    id: "primary3",
    am: [
      { bg: "#08B4E0", badge: "#18C4F0", text: "#1a1a1a" }, // 0時(12) シアン
      { bg: "#E0108C", badge: "#F020A0", text: "#ffffff" }, // 1時  マゼンタ
      { bg: "#FCE410", badge: "#FFEE20", text: "#1a1a1a" }, // 2時  イエロー
      { bg: "#08B4E0", badge: "#18C4F0", text: "#1a1a1a" }, // 3時  シアン
      { bg: "#E0108C", badge: "#F020A0", text: "#ffffff" }, // 4時  マゼンタ
      { bg: "#FCE410", badge: "#FFEE20", text: "#1a1a1a" }, // 5時  イエロー
      { bg: "#08B4E0", badge: "#18C4F0", text: "#1a1a1a" }, // 6時  シアン
      { bg: "#E0108C", badge: "#F020A0", text: "#ffffff" }, // 7時  マゼンタ
      { bg: "#FCE410", badge: "#FFEE20", text: "#1a1a1a" }, // 8時  イエロー
      { bg: "#08B4E0", badge: "#18C4F0", text: "#1a1a1a" }, // 9時  シアン
      { bg: "#E0108C", badge: "#F020A0", text: "#ffffff" }, // 10時 マゼンタ
      { bg: "#FCE410", badge: "#FFEE20", text: "#1a1a1a" }, // 11時 イエロー
    ],
    pm: [
      { bg: "#08B4E0", badge: "#18C4F0", text: "#1a1a1a" }, // 12時 シアン
      { bg: "#E0108C", badge: "#F020A0", text: "#ffffff" }, // 13時 マゼンタ
      { bg: "#FCE410", badge: "#FFEE20", text: "#1a1a1a" }, // 14時 イエロー
      { bg: "#08B4E0", badge: "#18C4F0", text: "#1a1a1a" }, // 15時 シアン
      { bg: "#E0108C", badge: "#F020A0", text: "#ffffff" }, // 16時 マゼンタ
      { bg: "#FCE410", badge: "#FFEE20", text: "#1a1a1a" }, // 17時 イエロー
      { bg: "#08B4E0", badge: "#18C4F0", text: "#1a1a1a" }, // 18時 シアン
      { bg: "#E0108C", badge: "#F020A0", text: "#ffffff" }, // 19時 マゼンタ
      { bg: "#FCE410", badge: "#FFEE20", text: "#1a1a1a" }, // 20時 イエロー
      { bg: "#08B4E0", badge: "#18C4F0", text: "#1a1a1a" }, // 21時 シアン
      { bg: "#E0108C", badge: "#F020A0", text: "#ffffff" }, // 22時 マゼンタ
      { bg: "#FCE410", badge: "#FFEE20", text: "#1a1a1a" }, // 23時 イエロー
    ],
  },

  // -------- いろのわ（Itten 12色相環） --------
  // 時計位置 = 色相環の位置。原色(黄・赤・青) = 12時,4時,8時 / 二次色(橙・紫・緑) = 2時,6時,10時
  // 対角は補色（12時⇔6時, 3時⇔9時 など）。AM/PM同色。
  {
    id: "wheel",
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

  // -------- みんなのいろ（色覚多様性対応パレット） --------
  // Okabe-Ito の色覚安全8色をベースに、時計用に12色へ拡張。
  // P型・D型・T型いずれでも隣接時刻が判別可能になるよう、
  //   1) 隣接は必ず暖↔寒で切り替え
  //   2) CVD下で似て見える色のペアは時計盤上で最大限離す
  //      （暖色3色=2/6/10時の正三角形、似色ペアは原則6時間=対面配置）
  //   3) 明度をバックアップチャンネル化しモノクロ化しても順番が読める
  // 位置情報を識別の補助に使えるよう、似色が近接しない配置にしている。
  {
    id: "cud12",
    am: [
      { bg: "#A64A80", badge: "#BC5A94", text: "#ffffff" }, // 0時(12) 赤紫                 0⇔8
      { bg: "#0060A0", badge: "#0072B2", text: "#ffffff" }, // 1時  濃い青                 1⇔7
      { bg: "#C24D00", badge: "#D55E00", text: "#ffffff" }, // 2時  朱(ヴァーミリオン)     暖色①/3
      { bg: "#56B4E9", badge: "#68C0F0", text: "#0A2030" }, // 3時  空色(ライト)           3⇔9
      { bg: "#F0E442", badge: "#FAE858", text: "#1a1a1a" }, // 4時  黄                     単独
      { bg: "#30A8B0", badge: "#40B8C0", text: "#ffffff" }, // 5時  青緑(ミッド)           5⇔11
      { bg: "#E69F00", badge: "#F4AC10", text: "#1a1a1a" }, // 6時  橙                     暖色②/3
      { bg: "#4828A0", badge: "#5830B0", text: "#ffffff" }, // 7時  すみれ(ダーク)         1⇔7
      { bg: "#F4A8BC", badge: "#FFB8CC", text: "#441624" }, // 8時  桃(ライト)             0⇔8
      { bg: "#78CCD0", badge: "#88DCE0", text: "#0A2830" }, // 9時  水色(ライト)           3⇔9
      { bg: "#A86828", badge: "#B87838", text: "#ffffff" }, // 10時 金茶                   暖色③/3
      { bg: "#009E73", badge: "#10AE83", text: "#ffffff" }, // 11時 青緑(明るめ)           5⇔11
    ],
    pm: [
      { bg: "#A64A80", badge: "#BC5A94", text: "#ffffff" }, // 12時 赤紫
      { bg: "#0060A0", badge: "#0072B2", text: "#ffffff" }, // 13時 濃い青
      { bg: "#C24D00", badge: "#D55E00", text: "#ffffff" }, // 14時 朱(ヴァーミリオン)
      { bg: "#56B4E9", badge: "#68C0F0", text: "#0A2030" }, // 15時 空色(ライト)
      { bg: "#F0E442", badge: "#FAE858", text: "#1a1a1a" }, // 16時 黄
      { bg: "#30A8B0", badge: "#40B8C0", text: "#ffffff" }, // 17時 青緑(ミッド)
      { bg: "#E69F00", badge: "#F4AC10", text: "#1a1a1a" }, // 18時 橙
      { bg: "#4828A0", badge: "#5830B0", text: "#ffffff" }, // 19時 すみれ(ダーク)
      { bg: "#F4A8BC", badge: "#FFB8CC", text: "#441624" }, // 20時 桃(ライト)
      { bg: "#78CCD0", badge: "#88DCE0", text: "#0A2830" }, // 21時 水色(ライト)
      { bg: "#A86828", badge: "#B87838", text: "#ffffff" }, // 22時 金茶
      { bg: "#009E73", badge: "#10AE83", text: "#ffffff" }, // 23時 青緑(明るめ)
    ],
  },

  // -------- ものとーん（真っ白・単色） --------
  // AM/PM/merged すべて区切り線と同じ白。文字は黒でコントラスト確保。
  // 盤面中央の色もこのパレット時だけ白に切り替えるので境目が消える。
  {
    id: "monotone",
    am: [
      { bg: "#ffffff", badge: "#ffffff", text: "#1a1a1a" }, // 0時(12)
      { bg: "#ffffff", badge: "#ffffff", text: "#1a1a1a" }, // 1時
      { bg: "#ffffff", badge: "#ffffff", text: "#1a1a1a" }, // 2時
      { bg: "#ffffff", badge: "#ffffff", text: "#1a1a1a" }, // 3時
      { bg: "#ffffff", badge: "#ffffff", text: "#1a1a1a" }, // 4時
      { bg: "#ffffff", badge: "#ffffff", text: "#1a1a1a" }, // 5時
      { bg: "#ffffff", badge: "#ffffff", text: "#1a1a1a" }, // 6時
      { bg: "#ffffff", badge: "#ffffff", text: "#1a1a1a" }, // 7時
      { bg: "#ffffff", badge: "#ffffff", text: "#1a1a1a" }, // 8時
      { bg: "#ffffff", badge: "#ffffff", text: "#1a1a1a" }, // 9時
      { bg: "#ffffff", badge: "#ffffff", text: "#1a1a1a" }, // 10時
      { bg: "#ffffff", badge: "#ffffff", text: "#1a1a1a" }, // 11時
    ],
    pm: [
      { bg: "#ffffff", badge: "#ffffff", text: "#1a1a1a" }, // 12時
      { bg: "#ffffff", badge: "#ffffff", text: "#1a1a1a" }, // 13時
      { bg: "#ffffff", badge: "#ffffff", text: "#1a1a1a" }, // 14時
      { bg: "#ffffff", badge: "#ffffff", text: "#1a1a1a" }, // 15時
      { bg: "#ffffff", badge: "#ffffff", text: "#1a1a1a" }, // 16時
      { bg: "#ffffff", badge: "#ffffff", text: "#1a1a1a" }, // 17時
      { bg: "#ffffff", badge: "#ffffff", text: "#1a1a1a" }, // 18時
      { bg: "#ffffff", badge: "#ffffff", text: "#1a1a1a" }, // 19時
      { bg: "#ffffff", badge: "#ffffff", text: "#1a1a1a" }, // 20時
      { bg: "#ffffff", badge: "#ffffff", text: "#1a1a1a" }, // 21時
      { bg: "#ffffff", badge: "#ffffff", text: "#1a1a1a" }, // 22時
      { bg: "#ffffff", badge: "#ffffff", text: "#1a1a1a" }, // 23時
    ],
  },
];

// ===== ルックアップ =====

export const DEFAULT_PALETTE_ID = palettes[0]!.id;

export function getPalette(id: string): Palette {
  return palettes.find((p) => p.id === id) ?? palettes[0]!;
}

export function getNextPalette(id: string): Palette {
  const idx = palettes.findIndex((p) => p.id === id);
  return palettes[(idx + 1) % palettes.length]!;
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
