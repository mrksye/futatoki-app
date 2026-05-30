import type { Component } from "solid-js";

/**
 * 全アイコン共通の中央描画基盤 (icons の「中央」= Zentral)。./svg/*.svg を ?raw で読んだ文字列を
 * 受け取り、class を注入して描画する。Solid には Astro の <Fragment set:html> 相当が無いので、layout
 * から消える display:contents の span を器にして innerHTML で SVG を流し込む。class を svg 自身に載せる
 * ことで、呼び出し側が渡す w-5 h-5 等のサイズ class が従来どおり svg に効く。
 */
const ZentralIcon: Component<{ svg: string; class?: string }> = (props) => {
  const markup = () =>
    props.class
      ? props.svg.replace("<svg", `<svg class="${props.class}"`)
      : props.svg;
  return <span style="display: contents" innerHTML={markup()} />;
};

export default ZentralIcon;
