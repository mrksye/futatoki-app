/* @refresh reload */
import { render } from "solid-js/web";
import "./index.css";
// kiosk-style 全画面ロック (position: fixed body + touch-action 系)。この行を消せば dormant。
import "./lib/kiosk-bootstrap";
// prefers-reduced-motion 対応: この行を消せば全機能 dormant。完全削除する場合は src/lib/motion.ts と
// motion-bootstrap.ts を消し、animateMotion 呼び出しを el.animate に戻し、index.css の
// body.motion-reduce ブロックを消す。
import "./lib/motion-bootstrap";
// dev mode 限定: window.__seedDemoActivities を露出。LP 側 screenshots.mjs から Playwright 経由で
// 呼ばれ Top hero 動画の「12 種できごと scatter」を録画する。本番 bundle では空。
import "./lib/demo-seam";
import App from "./App";

const root = document.getElementById("root");
if (!root) throw new Error("Root element not found");

// iOS Safari の長押し callout / 文字選択を JS でも封殺。CSS だけでは取り切れないケースに備え、
// contextmenu / selectstart を preventDefault + selectionchange で発生済み選択を即 clear する。
// それでも iPhone では「コピー/検索/翻訳」の callout は残る (詳細は index.css の
// button[aria-label]::before コメント参照)。
document.addEventListener("contextmenu", (e) => e.preventDefault());
document.addEventListener("selectstart", (e) => e.preventDefault());
document.addEventListener("selectionchange", () => {
  const sel = window.getSelection();
  if (sel && !sel.isCollapsed) sel.removeAllRanges();
});

// PWA: 新 SW が有効化されたらリロード。初回インストール (起動時 controller 不在) はスキップ。
if ("serviceWorker" in navigator) {
  const hadControllerAtStart = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (hadControllerAtStart) window.location.reload();
  });
}

render(() => <App />, root);
