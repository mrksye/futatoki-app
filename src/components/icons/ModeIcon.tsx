import type { Component } from "solid-js";
import ZentralIcon from "./ZentralIcon";
import rawSvg from "./svg/mode.svg?raw";

/**
 * モードピッカートリガー用アイコン: 2 枚の矩形を斜めにずらして重ねた図形で「複数のモード /
 * 切替」を表現。アプリ名「ふたとき」(2 つの時計) の双対イメージとも呼応する。前面矩形が背面
 * 矩形を部分的に隠す効果は mask で背面 stroke を切り抜くことで実現 (前面に opaque fill を載せる
 * 方式は親ボタンの bg-white/80 と色がズレるため)。stroke-width 2 で太め、stroke-linejoin=round
 * で角を丸めて子ども向け UI に馴染ませる。色は currentColor で外から CSS text color に追従。
 * 図形は ./svg/mode.svg。mask id は単一インスタンス前提で固定名。複数同時描画するなら描画ごとに
 * id を固有化する必要がある。
 */
const ModeIcon: Component<{ class?: string }> = (props) => (
  <ZentralIcon svg={rawSvg} class={props.class} />
);

export default ModeIcon;
