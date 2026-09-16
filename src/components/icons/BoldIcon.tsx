import type { Component } from "solid-js";
import ZentralIcon from "./ZentralIcon";
import rawSvg from "./svg/bold.svg?raw";

/**
 * 文字を太くする操作の定番である「B」を模した icon。数字を大きくする (強調する) メニューの
 * トリガーに使う。viewBox 24x24、左の縦棒 x=5〜8.5 に上下 2 つのボウルを付け、上は半径 3.25
 * (y 4〜10.5)、下は半径 4.75 (y 10.5〜20) の半円で B の非対称を出す。ボウルの内側は
 * fill-rule=evenodd の穴として同じ path に持たせ、壁の厚みを上下とも 2 に揃える。
 * 色は currentColor で外側 CSS text color に追従する。図形は ./svg/bold.svg。
 */
const BoldIcon: Component<{ class?: string }> = (props) => (
  <ZentralIcon svg={rawSvg} class={props.class} />
);

export default BoldIcon;
