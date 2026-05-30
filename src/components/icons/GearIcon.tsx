import type { Component } from "solid-js";
import ZentralIcon from "./ZentralIcon";
import rawSvg from "./svg/gear.svg?raw";

/**
 * 8 歯のまるい歯車アイコン。⚙ emoji を OS ごとの絵柄差で使いたくないので SVG primitives で組む。
 * viewBox 24x24、中心 (12,12)、本体半径 9 (viewBox を太く使う、歯を低めにした分を相殺)、歯は
 * (10,0.5)-(14,5) の pill 形 rect (w=4, h=4.5, rx=2 で上下端が完全な半円) を 45 度刻みで 8 枚、
 * 中心穴は mask で半径 4 を抜く。歯の可視高さ ≒ 2.5 (本体半径の 28%) と低めに抑えて「カクカク
 * した gear tooth 感」を消し、本体を太くすることでアイコン全体は viewBox 限界まで大きく見せる。
 * 色は currentColor で CSS text color に追従。穴の透過は mask 経由でボタン背景がそのまま透ける。
 * 図形は ./svg/gear.svg。mask id は単一インスタンス前提で固定名。複数同時描画するなら描画ごとに
 * id を固有化する必要がある。
 */
const GearIcon: Component<{ class?: string }> = (props) => (
  <ZentralIcon svg={rawSvg} class={props.class} />
);

export default GearIcon;
