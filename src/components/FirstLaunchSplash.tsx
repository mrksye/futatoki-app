import { createMemo, createSignal, onMount, type Component } from "solid-js";
import ClockFace from "./ClockFace";
import HandsLayer from "./HandsLayer";
import { useOrientation } from "../hooks/useOrientation";
import { useViewport } from "../hooks/useViewport";
import { runSplashSequence } from "../features/first-launch/controller";

/**
 * 初回起動 splash (はつかいきスプラッシュ): ClockLayout を一切汚さずに overlay として上に被さり、
 * 2 phase 構造の演出を完走したら自分自身を unmount して下層の ClockLayout を露出させる。
 *
 * 内部 2 phase:
 *   "single" — AM/PM 両 wrapper を merged 風 transform (互いに半幅ぶん center 寄せ) で重ね、
 *              period="merged" で同色描画 → 視覚上は単体時計 1 個。DWELL + GUGUGU はこの状態。
 *   "burst"  — AM/PM wrapper の CSS transform が translate(0,0) に解け、bouncy easing
 *              (cubic-bezier(.34, 1.56, .64, 1)) で overshoot 付きに両端へ押し出される。同時に
 *              period が "am"/"pm" に切替わって AM/PM 配色になる。
 *
 * サイズは ClockLayout の maxClockSize と同じ logic (= min(halfW, halfH))。Splash には floating
 * palette ボタンがないので palette clearance は不要 = ClockLayout より単純な natural 計算で十分。
 * これで burst 完了時の AM/PM 着地サイズと下層 ClockLayout の AM/PM サイズが一致して、Splash 消失
 * 時の視覚継ぎ目が出ない。
 *
 * 背景 gradient は index.css の html/body/#root に塗られた値と同期 (= app 全体の bg を Splash で
 * 再現)。gradient stop を index.css 側で変えたらこちらも同期更新すること。
 */
const FirstLaunchSplash: Component = () => {
  const isLandscape = useOrientation();
  const viewport = useViewport();

  const [phase, setPhase] = createSignal<"single" | "burst">("single");

  let containerRef: HTMLDivElement | undefined;
  let centerRef: HTMLDivElement | undefined;

  /** 各 AM/PM wrapper 内の clock SVG サイズ。ClockLayout の natural maxClockSize と同じ。 */
  const clockSize = createMemo(() => {
    const w = viewport.width();
    const h = viewport.height();
    const land = isLandscape();
    const halfW = land ? w / 2 : w;
    const halfH = land ? h : h / 2;
    return Math.min(halfW, halfH);
  });

  // splash 表示中の時計は静止。マウント時点の時刻で固定し、Splash unmount 後は ClockLayout の
  // useCurrentTime が tick を再開する。
  const now = new Date();
  const hours = now.getHours();
  const minutes = now.getMinutes();

  /** single phase での AM wrapper 寄せ transform。flex-1 で左半分に居る AM を右半幅ぶん中央寄せ
   *  して PM と重ねる。landscape は X 軸、portrait は Y 軸。 */
  const amSingleTransform = createMemo(() =>
    isLandscape() ? "translateX(50%)" : "translateY(50%)",
  );
  /** single phase での PM wrapper 寄せ transform (AM と対称)。 */
  const pmSingleTransform = createMemo(() =>
    isLandscape() ? "translateX(-50%)" : "translateY(-50%)",
  );

  const amTransform = createMemo(() =>
    phase() === "single" ? amSingleTransform() : "translate(0, 0)",
  );
  const pmTransform = createMemo(() =>
    phase() === "single" ? pmSingleTransform() : "translate(0, 0)",
  );

  onMount(() => {
    if (!centerRef || !containerRef) return;
    runSplashSequence({
      shakeTarget: centerRef,
      fadeTarget: containerRef,
      onBurst: () => setPhase("burst"),
    }).catch((err) => {
      try { console.warn("[firstLaunch] splash sequence failed:", err); } catch (_) {}
    });
  });

  return (
    <div
      ref={(el) => (containerRef = el)}
      class="fixed inset-0 z-[100]"
      style={{
        background: "linear-gradient(160deg, #fef6e4 0%, #fce4ec 35%, #e8eaf6 65%, #e0f7fa 100%)",
        "will-change": "opacity",
      }}
    >
      <div
        ref={(el) => (centerRef = el)}
        class={"absolute inset-0 flex items-stretch " + (isLandscape() ? "flex-row" : "flex-col")}
        style={{ "transform-origin": "center", "will-change": "transform" }}
      >
        {/* AM wrapper. single phase は merged 風 transform で PM と重ね、burst phase で
            bouncy easing で本来位置 (flex-1 の中央) へ overshoot 付きで戻る。 */}
        <div
          class="flex-1 flex items-center justify-center"
          style={{
            transform: amTransform(),
            transition: "transform 620ms cubic-bezier(.34, 1.56, .64, 1)",
            "will-change": "transform",
          }}
        >
          <div
            class="relative"
            style={{
              width: `${clockSize()}px`,
              height: `${clockSize()}px`,
              "transform-origin": "center",
            }}
          >
            <ClockFace
              period={phase() === "single" ? "merged" : "am"}
              hours={hours}
            />
            <HandsLayer hours={hours} minutes={minutes} />
          </div>
        </div>

        {/* PM wrapper (AM と対称)。 */}
        <div
          class="flex-1 flex items-center justify-center"
          style={{
            transform: pmTransform(),
            transition: "transform 620ms cubic-bezier(.34, 1.56, .64, 1)",
            "will-change": "transform",
          }}
        >
          <div
            class="relative"
            style={{
              width: `${clockSize()}px`,
              height: `${clockSize()}px`,
              "transform-origin": "center",
            }}
          >
            <ClockFace
              period={phase() === "single" ? "merged" : "pm"}
              hours={hours}
            />
            <HandsLayer hours={hours} minutes={minutes} />
          </div>
        </div>
      </div>
    </div>
  );
};

export default FirstLaunchSplash;
