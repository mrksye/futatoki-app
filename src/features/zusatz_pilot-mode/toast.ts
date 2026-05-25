import { motionAllowed } from "../../lib/motion";

/**
 * 解錠した瞬間に下部から出して自動で消える通知トースト。golden-aura.ts と同じく Solid ツリー非経由で
 * document.body へ生 DOM をねじ込む黒魔術 — host にコード行を足さない。下からスッと現れて数秒で消える。
 * reduce-motion 時はスライド/フェード無しで、出して一定時間後に remove する。
 */

const TITLE = "Pilot Mode";
const MESSAGE = "Activated";
/** 出現〜保持〜消滅までの総尺。Android の Developer Mode トースト並みにしっかり読める長さ。 */
const TOTAL_MS = 5000;

export const showPilotModeToast = (): void => {
  if (typeof document === "undefined") return;

  const el = document.createElement("div");
  // role=status でスクリーンリーダーにも控えめに通知。
  el.setAttribute("role", "status");
  el.style.cssText =
    "position:fixed;left:50%;bottom:calc(env(safe-area-inset-bottom, 0px) + 24px);" +
    "transform:translate(-50%, 20px);z-index:201;pointer-events:none;opacity:0;" +
    "display:flex;flex-direction:column;align-items:center;gap:1px;" +
    "padding:9px 22px;border-radius:9999px;background:rgba(20,20,20,0.92);" +
    "box-shadow:0 8px 24px rgba(0,0,0,0.35), inset 0 0 0 1px rgba(255,200,61,0.55);" +
    "text-align:center;";

  const title = document.createElement("div");
  title.textContent = TITLE;
  title.style.cssText = "color:#FFC83D;font-weight:800;font-size:15px;letter-spacing:0.05em;";

  const message = document.createElement("div");
  message.textContent = MESSAGE;
  message.style.cssText = "color:#f3f3f3;font-size:12px;opacity:0.85;";

  el.append(title, message);
  document.body.appendChild(el);

  if (motionAllowed()) {
    const anim = el.animate(
      [
        { opacity: 0, transform: "translate(-50%, 20px)", offset: 0 },
        { opacity: 1, transform: "translate(-50%, 0)", offset: 0.06 },
        { opacity: 1, transform: "translate(-50%, 0)", offset: 0.86 },
        { opacity: 0, transform: "translate(-50%, 12px)", offset: 1 },
      ],
      { duration: TOTAL_MS, easing: "ease", fill: "forwards" },
    );
    anim.onfinish = () => el.remove();
  } else {
    el.style.opacity = "1";
    el.style.transform = "translate(-50%, 0)";
    setTimeout(() => el.remove(), TOTAL_MS);
  }
};
