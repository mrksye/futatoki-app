import { createSignal } from "solid-js";

/**
 * 初回起動 (はつかいき) splash の表示判定。
 *
 * このアプリは LP / チュートリアルを意図的に持たない。代わりに「ブラウザ経由で開いた時」だけ
 * 自由回転 (freeRotate) モード + かさね (merged) で静止単体時計を出してアプリを開き、起動と同時に
 * 時間 trigger で自動的に「ちょっと間 dwell → ググググ〜〜 → パーンッ」と並列時計 (split + clock
 * モード) に着地する一発演出を見せる。
 *
 * 判定軸は PWA install 状態のみ:
 *   standalone (display-mode: standalone / fullscreen / minimal-ui) もしくは iOS Safari の
 *   navigator.standalone === true  → 出さない (= もう "初回" は卒業)
 *   それ以外 (通常ブラウザタブ)     → 出す (毎ロード/毎タブで再生)
 *
 * 永続フラグ (localStorage) は持たない: 「初回卒業」の意味を OS 側の PWA install/uninstall に委譲
 * する。これにより localStorage への副作用なしで判定が完結し、(a) LP → アプリ流入のたびに splash
 * が見える = ブラウザ経由ユーザにはブランド演出として繰り返し露出、(b) PWA install ユーザは初回
 * インストール直後の 1 回だけ splash を見て以後ずっと出ない、という素直な分岐になる。
 *
 * 演出完走後 (= splash unmount 直前) に deactivateFirstLaunch() で session signal を落とす。これは
 * 演出シーケンス側 (時間 trigger 軸) の責任で永続側との結合はない
 * ([[feedback_independent_triggers_dont_merge]] — 旧版は永続 pending と session active の 2 軸独立
 * 設計だったが、永続側を OS install 状態に委譲したため今は session 1 軸のみ)。
 */
const isStandaloneMode = (): boolean => {
  try {
    if (typeof window === "undefined") return false;
    if (window.matchMedia?.("(display-mode: standalone)").matches) return true;
    if (window.matchMedia?.("(display-mode: fullscreen)").matches) return true;
    if (window.matchMedia?.("(display-mode: minimal-ui)").matches) return true;
    const navStandalone = (navigator as Navigator & { standalone?: boolean }).standalone;
    return navStandalone === true;
  } catch {
    return false;
  }
};

const [firstLaunchActive, setFirstLaunchActive] = createSignal(!isStandaloneMode());

export { firstLaunchActive };

/** 演出完走で splash を unmount するための session signal を落とす。下層の ClockLayout が
 *  Show 分岐で fallback として表示される。 */
export const deactivateFirstLaunch = (): void => {
  setFirstLaunchActive(false);
};
