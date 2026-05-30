import type { Component } from "solid-js";
import ZentralIcon from "./ZentralIcon";
import rawSvg from "./svg/rewind.svg?raw";

/**
 * メディアプレーヤーの「早戻し」(⏪) を模した icon。左向き三角形 2 つを横に並べた構図で、
 * 1ふんもどす ボタンに「巻き戻す」操作を視覚化する。viewBox 24x24、各三角形は高さ 14
 * (中心 12 から ±7)、横幅 8、左右の三角の頂点 x = 4 / 12、底辺 x = 12 / 20 で中心対称。
 * 色は currentColor で外側 CSS text color に追従し、stroke-linejoin=round で角を丸めて
 * 子ども向け UI に馴染ませる。塗りで描き stroke は使わない。図形は ./svg/rewind.svg。
 */
const RewindIcon: Component<{ class?: string }> = (props) => (
  <ZentralIcon svg={rawSvg} class={props.class} />
);

export default RewindIcon;
