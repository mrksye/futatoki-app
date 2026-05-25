import { createEffect, on, onCleanup } from "solid-js";
import { Howl } from "howler";
import { timerPhase } from "./state";
import timerEndM4a from "./sounds/timer-end.m4a";

/**
 * タイマー完了 (done) 時に鳴らす音 (fuwari, 82秒 / 末尾 0.3秒フェードアウト, モノラル, -16 LUFS)。
 * loop: true で 完了ボタン or モード離脱まで永久リピート (一時停止は無し)。
 *
 * フォーマットは AAC-LC (.m4a, ~600KB) 1 本。AAC は全端末で鳴る (iOS の純正コーデックなので iPhone/iPad
 * は全世代 OK、Chrome/Edge/Android/Firefox も対応) かつ mp3 より高効率。Opus(webm) は古い iOS で鳴らず、
 * 今回のような短尺モノ音楽だと Opus の圧縮優位もほぼ無いので不採用 (Opus は将来の声かけ音声向け)。
 *
 * autoplay policy: Howler はモジュール読込時にグローバル unlock listener を張り、初回ユーザー操作で
 * AudioContext を解錠する。タイマーは「すたーと」押下から始まるので done 時の自動再生は弾かれない。
 * Howl は lazy 生成 + running 中に preload で done までにロードを済ませる。
 */
let howl: Howl | null = null;
const getHowl = (): Howl => {
  if (!howl) {
    // format を明示: バンドルされた URL (timer-end-[hash].m4a) でも Howler が確実に形式判定できる。
    howl = new Howl({ src: [timerEndM4a], format: ["m4a"], volume: 0.7, loop: true, preload: true });
  }
  return howl;
};

/** running 中に呼んで読み込みを先に済ませる (done での再生遅延を防ぐ)。 */
export const preloadTimerEndSound = (): void => {
  getHowl();
};

/** 完了音をループ再生し始める。 */
export const playTimerEndSound = (): void => {
  try {
    const h = getHowl();
    h.stop();
    h.play();
  } catch (e) {
    try { console.warn("[timer-sound] play failed:", e); } catch (_) {}
  }
};

/** 鳴っている音を止める (完了ボタン / とりけし / モード離脱時)。 */
export const stopTimerEndSound = (): void => {
  try { howl?.stop(); } catch (_) {}
};

/**
 * 完了音の reactive 配線。TimerLayout から呼ぶ:
 *   - running に入ったら preload (done での再生遅延回避)
 *   - done に入ったらループ再生開始 / done を抜けたら (完了 / とりけし) 停止
 *   - unmount (タイマーモード離脱) でも停止
 */
export const useTimerEndSound = (): void => {
  createEffect(on(() => timerPhase() === "running", (running) => {
    if (running) preloadTimerEndSound();
  }));
  createEffect(on(() => timerPhase() === "done", (done, prev) => {
    if (done) playTimerEndSound();
    else if (prev) stopTimerEndSound();
  }));
  onCleanup(stopTimerEndSound);
};
