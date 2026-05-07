/**
 * カラーパレット集。
 *
 * 新しいパレットを追加する場合は下の `palettes` 配列に push するだけで OK。
 *   id    : 永続化 & i18n キー参照用 (変更すると保存設定と翻訳参照が壊れる)
 *   am/pm : 0-11 時 / 12-23 時の各 12 色
 *   各色  : { bg (扇形背景), badge (バッジ円), text (バッジ数字、bg コントラスト確保) }
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

/** 配列の先頭が初期値 (= デフォルトパレット)。順序は「べつのいろ」ボタンの循環順になる。 */
export const palettes: Palette[] = [
  // -------- くっきりいろ --------
  // 隣接時間が最大限に識別できるよう寒暖・色相を意図的に飛ばすカテゴリカル配色 (Glasbey 思想)。
  // 色覚多様性に配慮し赤↔緑の直接隣接は避けている。初期パレット。
  {
    id: "distinct12",
    am: [
      { bg: "#DC2040", badge: "#E83050", text: "#ffffff" }, // 0時(12) 赤
      { bg: "#20A0A8", badge: "#30B0B8", text: "#082828" }, // 1時  ティール
      { bg: "#F4C800", badge: "#FFD400", text: "#1a1a1a" }, // 2時  黄
      { bg: "#9020B0", badge: "#A030C0", text: "#ffffff" }, // 3時  紫
      { bg: "#F08020", badge: "#FA9030", text: "#2a1408" }, // 4時  橙
      { bg: "#2060C8", badge: "#3070D8", text: "#ffffff" }, // 5時  青
      { bg: "#F8A0B0", badge: "#FFB0C0", text: "#4a1820" }, // 6時  ピンク
      { bg: "#30A048", badge: "#40B058", text: "#0d2814" }, // 7時  緑
      { bg: "#A0602A", badge: "#B0703A", text: "#ffffff" }, // 8時  茶
      { bg: "#60B0E0", badge: "#70C0F0", text: "#1a2040" }, // 9時  水色
      { bg: "#E040A0", badge: "#F050B0", text: "#2a0820" }, // 10時 マゼンタ
      { bg: "#A0C020", badge: "#B0D030", text: "#1a1a1a" }, // 11時 黄緑
    ],
    pm: [
      { bg: "#DC2040", badge: "#E83050", text: "#ffffff" }, // 12時 赤
      { bg: "#20A0A8", badge: "#30B0B8", text: "#082828" }, // 13時 ティール
      { bg: "#F4C800", badge: "#FFD400", text: "#1a1a1a" }, // 14時 黄
      { bg: "#9020B0", badge: "#A030C0", text: "#ffffff" }, // 15時 紫
      { bg: "#F08020", badge: "#FA9030", text: "#2a1408" }, // 16時 橙
      { bg: "#2060C8", badge: "#3070D8", text: "#ffffff" }, // 17時 青
      { bg: "#F8A0B0", badge: "#FFB0C0", text: "#4a1820" }, // 18時 ピンク
      { bg: "#30A048", badge: "#40B058", text: "#0d2814" }, // 19時 緑
      { bg: "#A0602A", badge: "#B0703A", text: "#ffffff" }, // 20時 茶
      { bg: "#60B0E0", badge: "#70C0F0", text: "#1a2040" }, // 21時 水色
      { bg: "#E040A0", badge: "#F050B0", text: "#2a0820" }, // 22時 マゼンタ
      { bg: "#A0C020", badge: "#B0D030", text: "#1a1a1a" }, // 23時 黄緑
    ],
  },

  // -------- そらのいろ --------
  // 時刻ごとの空の色彩語に基づく配色。緑や黄色の "自然色" を排し、すべて空に見える色で構成。
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
      { bg: "#F4B868", badge: "#FFC880", text: "#ffffff" }, // 8時  朝の金色
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

  // -------- あおきみどり (黄・緑・青の 3 色ループ。hour mod 3 == 0 → 青) --------
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

  // -------- さんげんしょく (CMY に近い鮮やかさを少し抑えた中間。3 色ループ) --------
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

  // -------- いろのわ (12 色相環、和名/カタカナ混在。AM/PM 同色) --------
  // 12 時=マゼンタ起点で時計回りに 320°→265° を 12 等分。
  {
    id: "wheel",
    am: [
      { bg: "#D63384", badge: "#E64394", text: "#ffffff" }, // 0時(12) ローズ
      { bg: "#E21C3D", badge: "#F22C4D", text: "#ffffff" }, // 1時  あか
      { bg: "#EA5A37", badge: "#FA6A47", text: "#ffffff" }, // 2時  赤茶
      { bg: "#FFA500", badge: "#FFB510", text: "#1a1a1a" }, // 3時  オレンジ
      { bg: "#FFD60A", badge: "#FFE61A", text: "#1a1a1a" }, // 4時  き
      { bg: "#D4DC1F", badge: "#E4EC2F", text: "#1a1a1a" }, // 5時  ライムイエロー
      { bg: "#5DAA34", badge: "#6DBA44", text: "#2a2a2a" }, // 6時  ウグイス
      { bg: "#2E9D5E", badge: "#3EAD6E", text: "#333333" }, // 7時  みどり
      { bg: "#20C997", badge: "#30D9A7", text: "#2a2a2a" }, // 8時  ミントグリーン
      { bg: "#18A2D9", badge: "#28B2E9", text: "#ffffff" }, // 9時  みずいろ
      { bg: "#2563C8", badge: "#3573D8", text: "#ffffff" }, // 10時 あお
      { bg: "#7E57C2", badge: "#8E67D2", text: "#ffffff" }, // 11時 むらさき
    ],
    pm: [
      { bg: "#D63384", badge: "#E64394", text: "#ffffff" }, // 12時 ローズ
      { bg: "#E21C3D", badge: "#F22C4D", text: "#ffffff" }, // 13時 あか
      { bg: "#EA5A37", badge: "#FA6A47", text: "#ffffff" }, // 14時 赤茶
      { bg: "#FFA500", badge: "#FFB510", text: "#1a1a1a" }, // 15時 オレンジ
      { bg: "#FFD60A", badge: "#FFE61A", text: "#1a1a1a" }, // 16時 き
      { bg: "#D4DC1F", badge: "#E4EC2F", text: "#1a1a1a" }, // 17時 ライムイエロー
      { bg: "#5DAA34", badge: "#6DBA44", text: "#2a2a2a" }, // 18時 ウグイス
      { bg: "#2E9D5E", badge: "#3EAD6E", text: "#333333" }, // 19時 みどり
      { bg: "#20C997", badge: "#30D9A7", text: "#2a2a2a" }, // 20時 ミントグリーン
      { bg: "#18A2D9", badge: "#28B2E9", text: "#ffffff" }, // 21時 みずいろ
      { bg: "#2563C8", badge: "#3573D8", text: "#ffffff" }, // 22時 あお
      { bg: "#7E57C2", badge: "#8E67D2", text: "#ffffff" }, // 23時 むらさき
    ],
  },

  // -------- みんなのいろ (色覚多様性対応) --------
  // Okabe-Ito の色覚安全 8 色をベースに 12 色へ拡張。P/D/T 型いずれでも隣接時刻が判別可能になるよう
  // 隣接は暖↔寒で切替、CVD で似て見えるペアは時計盤上で最大限離す (例: 似色ペアは原則 6 時間 = 対面)。
  // 明度も backup channel として使えるのでモノクロ化しても順序が読める。
  {
    id: "cud12",
    am: [
      { bg: "#A64A80", badge: "#BC5A94", text: "#1a1a1a" }, // 0時(12) 赤紫                 0⇔8
      { bg: "#0060A0", badge: "#0072B2", text: "#ffffff" }, // 1時  濃い青                 1⇔7
      { bg: "#C24D00", badge: "#D55E00", text: "#1a1a1a" }, // 2時  朱(ヴァーミリオン)     暖色①/3
      { bg: "#56B4E9", badge: "#68C0F0", text: "#0A2030" }, // 3時  空色(ライト)           3⇔9
      { bg: "#F0E442", badge: "#FAE858", text: "#1a1a1a" }, // 4時  黄                     単独
      { bg: "#30A8B0", badge: "#40B8C0", text: "#1a1a1a" }, // 5時  青緑(ミッド)           5⇔11
      { bg: "#E69F00", badge: "#F4AC10", text: "#1a1a1a" }, // 6時  橙                     暖色②/3
      { bg: "#4828A0", badge: "#5830B0", text: "#ffffff" }, // 7時  すみれ(ダーク)         1⇔7
      { bg: "#F4A8BC", badge: "#FFB8CC", text: "#441624" }, // 8時  桃(ライト)             0⇔8
      { bg: "#78CCD0", badge: "#88DCE0", text: "#0A2830" }, // 9時  水色(ライト)           3⇔9
      { bg: "#A86828", badge: "#B87838", text: "#1a1a1a" }, // 10時 金茶                   暖色③/3
      { bg: "#009E73", badge: "#10AE83", text: "#1a1a1a" }, // 11時 青緑(明るめ)           5⇔11
    ],
    pm: [
      { bg: "#A64A80", badge: "#BC5A94", text: "#1a1a1a" }, // 12時 赤紫
      { bg: "#0060A0", badge: "#0072B2", text: "#ffffff" }, // 13時 濃い青
      { bg: "#C24D00", badge: "#D55E00", text: "#1a1a1a" }, // 14時 朱
      { bg: "#56B4E9", badge: "#68C0F0", text: "#0A2030" }, // 15時 空色
      { bg: "#F0E442", badge: "#FAE858", text: "#1a1a1a" }, // 16時 黄
      { bg: "#30A8B0", badge: "#40B8C0", text: "#1a1a1a" }, // 17時 青緑(ミッド)
      { bg: "#E69F00", badge: "#F4AC10", text: "#1a1a1a" }, // 18時 橙
      { bg: "#4828A0", badge: "#5830B0", text: "#ffffff" }, // 19時 すみれ
      { bg: "#F4A8BC", badge: "#FFB8CC", text: "#441624" }, // 20時 桃
      { bg: "#78CCD0", badge: "#88DCE0", text: "#0A2830" }, // 21時 水色
      { bg: "#A86828", badge: "#B87838", text: "#1a1a1a" }, // 22時 金茶
      { bg: "#009E73", badge: "#10AE83", text: "#1a1a1a" }, // 23時 青緑
    ],
  },

  // -------- ものとーん (真っ白・単色) --------
  // AM/PM/merged すべて区切り線と同じ白。文字は黒でコントラスト確保。
  // 盤面中央もこのパレット時だけ白に切り替え (= 境目が消える)。
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

/**
 * 秒バーの active 色。通常は時の bg を使うが、monotone (bg = #ffffff) では
 * 白い盤面に白が乗って消えるので near-black に差し替える。
 */
export function getSecondsBarColor(palette: Palette, hour24: number): string {
  if (palette.id === "monotone") return "#555555";
  return getHourColor(palette, hour24).bg;
}
