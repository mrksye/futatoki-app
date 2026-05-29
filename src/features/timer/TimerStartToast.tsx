import { createEffect, createSignal, type Component } from "solid-js";
import { motionAllowed } from "../../lib/motion";

/**
 * タイマー開始時に画面下から出てスッと消える通知トースト。「音で知らせる」を告知することで、
 * 1) 静かな場所で予期せず音が鳴る事故を防ぐ、2) 音を切ってる人にアラームが届かない事故を防ぐ、の
 * 両方を一度にケアする。文言は短く言い切り、どの locale でも 1 行に収まる長さに保つ。
 *
 * PilotMode の toast.ts (生 DOM 注入) とは意図的に独立した再実装。Solid component 化しているので
 * reactive な signal で表示制御できる (将来別メッセージへの拡張余地がある)。App ルートに 1 回 mount し
 * 続け、showTimerStartToast() の signal 更新で出現させる。
 *
 * 再表示 (連続して開始) しても破綻しないよう、前回の hide setTimeout は破棄して仕切り直す。
 * reduce-motion 時はスライド/フェード無しで保持→消滅。
 */

/** 出現〜保持〜消滅までの総尺。Android の Developer Mode トースト並みにしっかり読める長さ。 */
const TOTAL_MS = 5000;

const [toastMessage, setToastMessage] = createSignal<string | null>(null);
let hideTimeoutId: ReturnType<typeof setTimeout> | null = null;

/** タイマー開始時に呼ぶ。message は i18n 済みの文字列 (caller 側で t("timer.startToast") する)。 */
export const showTimerStartToast = (message: string): void => {
  setToastMessage(message);
  if (hideTimeoutId !== null) clearTimeout(hideTimeoutId);
  hideTimeoutId = setTimeout(() => {
    setToastMessage(null);
    hideTimeoutId = null;
  }, TOTAL_MS);
};

const TimerStartToast: Component = () => {
  let el: HTMLDivElement | undefined;

  // signal が立つたびに WAAPI を回す。fill:forwards で animation 終端の状態 (opacity 0) を保持し、
  // signal が null に戻った時点で <Show> が要素を unmount するので残骸は出ない。
  createEffect(() => {
    const msg = toastMessage();
    if (msg === null || !el) return;
    if (!motionAllowed()) {
      el.style.opacity = "1";
      el.style.transform = "translate(-50%, 0)";
      return;
    }
    el.animate(
      [
        { opacity: 0, transform: "translate(-50%, 20px)", offset: 0 },
        { opacity: 1, transform: "translate(-50%, 0)", offset: 0.06 },
        { opacity: 1, transform: "translate(-50%, 0)", offset: 0.86 },
        { opacity: 0, transform: "translate(-50%, 12px)", offset: 1 },
      ],
      { duration: TOTAL_MS, easing: "ease", fill: "forwards" },
    );
  });

  return (
    <div
      ref={el}
      role="status"
      aria-live="polite"
      style={
        "position:fixed;left:50%;bottom:calc(env(safe-area-inset-bottom, 0px) + 24px);" +
        "transform:translate(-50%, 20px);z-index:201;pointer-events:none;opacity:0;" +
        "max-width:min(88vw, 480px);padding:11px 24px;border-radius:9999px;" +
        "background:rgba(20,20,20,0.92);" +
        "box-shadow:0 8px 24px rgba(0,0,0,0.35), inset 0 0 0 1px rgba(255,255,255,0.12);" +
        "text-align:center;color:#f3f3f3;font-size:15px;font-weight:600;line-height:1.4;"
      }
    >
      {toastMessage() ?? ""}
    </div>
  );
};

export default TimerStartToast;
