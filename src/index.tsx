/* @refresh reload */
import { render } from "solid-js/web";
import "./index.css";
import App from "./App";

const root = document.getElementById("root");
if (!root) throw new Error("Root element not found");

document.addEventListener("contextmenu", (e) => e.preventDefault());

// PWA: 新SWが有効化されたらリロードして新アセットを取り込む。
// 初回インストール（起動時に controller が居ない）の場合はスキップ。
if ("serviceWorker" in navigator) {
  const hadControllerAtStart = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (hadControllerAtStart) window.location.reload();
  });
}

render(() => <App />, root);
