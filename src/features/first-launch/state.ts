import { createSignal } from "solid-js";
import { persistedSignal } from "../../lib/persisted-signal";

/**
 * 初回起動 (はつかいき) の演出待ちフラグ。
 *
 * このアプリは LP / チュートリアルを意図的に持たない。代わりに「初回起動だけ」自由回転 (freeRotate)
 * モード + かさね (merged) で静止単体時計を出してアプリを開き、起動と同時に時間 trigger で自動的に
 * 「ちょっと間 dwell → ググググ〜〜 → パーンッ」と並列時計 (split + clock モード) に着地する
 * 一発演出を見せる。
 *
 * 値の意味:
 *   true  — 次回起動時に演出を出す。boot で freeRotate に入り演出を自動 kick off。
 *   false — 通常起動。clockMode は初期値の "clock" のまま、何もしない。
 *
 * フラグを倒すタイミングは「演出の自動発火」ではなく「最初の pointerdown 観測」: ユーザが画面に
 * 触れた = アプリと interact した、のが「使い始めた」の定義。受動的に演出だけ流し見た人は使い
 * 始めたと見なさない。即戻る (= hardware back / swipe-away) で離脱した user は pointerdown が
 * 観測されないので pending=true のまま、次回起動でまた同じ演出を見せる。
 *
 * `firstLaunch.pending` の storage 値は brand.config.ts の storagePrefix 経由で localStorage に書かれ、
 * 同一ブラウザ・同一 storagePrefix で永続化される。クリアしたい場合は localStorage の該当 key を消す。
 */
const [firstLaunchPending, setFirstLaunchPending] = persistedSignal<boolean>(
  "firstLaunch.pending",
  true,
);

/** 現在のセッションで初回起動 splash を出すか。boot で persisted pending() を読んで初期化し、
 *  演出完走後 (= splash unmount 直前) に false に落とす。これは session 内 signal で永続化しない
 *  (永続フラグは firstLaunchPending 側、独立した責任 / 軸 B; [[feedback_independent_triggers_dont_merge]])。 */
const [firstLaunchActive, setFirstLaunchActive] = createSignal(firstLaunchPending());

export { firstLaunchPending, firstLaunchActive };

/** 永続フラグを倒す。最初の pointerdown を観測した瞬間に呼ばれ、以後の launch では splash を
 *  出さない (= 「アプリと interact した」マーク)。受動的に演出だけ流し見した user は呼ばれない
 *  ため pending=true のまま、次回起動でまた splash を見る。 */
export const completeFirstLaunch = (): void => {
  setFirstLaunchPending(false);
};

/** 演出完走で splash を unmount するための session signal を落とす。下層の ClockLayout が
 *  Show 分岐で fallback として表示される。 */
export const deactivateFirstLaunch = (): void => {
  setFirstLaunchActive(false);
};
