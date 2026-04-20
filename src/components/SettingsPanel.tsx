import { Show, createEffect, createSignal, on, onCleanup, untrack, type Component } from "solid-js";
import { useSettings } from "../store/settings";
import { getNextPalette } from "../colors";
import { useOrientation } from "../hooks/useOrientation";
import { useI18n } from "../i18n";

const SettingsPanel: Component = () => {
  const { t } = useI18n();
  const {
    settings,
    setColorMode,
    setTimeFormat,
    setDetailMode,
    cyclePalette,
    toggleRotateStyle,
    rotate,
    enterRotate,
    exitRotate,
    setRotateMinutes,
    setRotateMode,
    randomizeRotate,
    toggleMerged,
  } = useSettings();
  const isLandscape = useOrientation();

  const toggleColorMode = () =>
    setColorMode(settings.colorMode === "sector" ? "badge" : "sector");

  const toggleTimeFormat = () =>
    setTimeFormat(settings.timeFormat === "24h" ? "12h" : "24h");

  const toggleDetailMode = () =>
    setDetailMode(settings.detailMode === "kuwashiku" ? "sukkiri" : "kuwashiku");

  // View Transitions API でモード切替時のボタン移動を自動アニメ化
  // （同じ view-transition-name を持つ要素同士が消滅→出現するとブラウザがモーフィング）
  const withViewTransition = (fn: () => void) => {
    const doc = document as Document & {
      startViewTransition?: (cb: () => void) => unknown;
    };
    if (typeof doc.startViewTransition === "function") {
      doc.startViewTransition(fn);
    } else {
      fn();
    }
  };

  const toggleRotate = () =>
    withViewTransition(() => (rotate.active ? exitRotate() : enterRotate()));

  // ===== 1分戻す（タップで-1、長押しで連続） =====
  let rewindHoldTimer: ReturnType<typeof setTimeout> | undefined;
  let rewindInterval: ReturnType<typeof setInterval> | undefined;

  const rewindTick = () => setRotateMinutes(rotate.minutes - 1);

  const stopRewind = () => {
    if (rewindHoldTimer) { clearTimeout(rewindHoldTimer); rewindHoldTimer = undefined; }
    if (rewindInterval) { clearInterval(rewindInterval); rewindInterval = undefined; }
  };

  const startRewind = (e: PointerEvent) => {
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    rewindTick();
    rewindHoldTimer = setTimeout(() => {
      rewindInterval = setInterval(rewindTick, 40);
    }, 250);
  };

  onCleanup(stopRewind);

  // タブレット以上(md: >= 768px)では少し大きめ
  // whitespace-nowrap: left+translateで右端寄せするボタン(1ふんもどす)がshrink-to-fitでCJK縦書きになるのを防ぐ
  const btnClass =
    "px-3 py-1.5 md:px-4 md:py-2 rounded-full text-[11px] md:text-[13px] font-bold shadow-md active:scale-90 transition-all bg-white/80 backdrop-blur-sm text-gray-700 whitespace-nowrap";

  // かさね/わけ切替時の位置アニメ（クロックの transform とタイミングを揃える）
  const moveTransition =
    "top 560ms cubic-bezier(.34,1.56,.64,1), left 560ms cubic-bezier(.34,1.56,.64,1), right 560ms cubic-bezier(.34,1.56,.64,1), bottom 560ms cubic-bezier(.34,1.56,.64,1), transform 150ms ease";

  // かさね/わけ切替中はクロックの移動アニメに注目してほしいので、
  // てまわし/1ふんもどす ボタンはアニメに合わせて極限まで薄く退避させる。
  // 自由回転モードへの出入り(active切替)時は merged も同時に変わるため、それは無視する。
  const [buttonsDimmed, setButtonsDimmed] = createSignal(false);
  let buttonsDimTimer: ReturnType<typeof setTimeout> | undefined;
  let prevRotateActive = rotate.active;
  createEffect(
    on(
      () => rotate.merged,
      (_curr, prev) => {
        const currActive = untrack(() => rotate.active);
        const activeChanged = currActive !== prevRotateActive;
        prevRotateActive = currActive;
        if (prev === undefined) return;
        if (activeChanged) return;
        setButtonsDimmed(true);
        if (buttonsDimTimer) clearTimeout(buttonsDimTimer);
        buttonsDimTimer = setTimeout(() => setButtonsDimmed(false), 620);
      },
    ),
  );
  onCleanup(() => {
    if (buttonsDimTimer) clearTimeout(buttonsDimTimer);
  });
  const dimTransition = "opacity 100ms ease";

  return (
    <>
      {/* 右上: じゆうかいてん / もどる（常時表示。上位モードのトグル） */}
      <button class={`fixed top-2 right-2 z-50 ${btnClass}`} onClick={toggleRotate}>
        {rotate.active ? t("settings.rotateExit") : t("settings.rotateEnter")}
      </button>

      {/* ===== 自由回転モード専用UI ===== */}
      <Show when={rotate.active}>
        {/* 左下: じどうかいてん 開始/停止（auto/manual問わず常時表示） */}
        <button
          class={`fixed bottom-2 left-2 z-50 ${btnClass}`}
          onClick={() => setRotateMode(rotate.mode === "auto" ? "manual" : "auto")}
        >
          {rotate.mode === "auto" ? t("settings.autoStop") : t("settings.autoStart")}
        </button>

        {/* manualサブモードのみの操作UI（auto中は非表示） */}
        <Show when={rotate.mode === "manual"}>
          {/* 左上: かさねる/わける（表示は切替先） */}
          <button class={`fixed top-2 left-2 z-50 ${btnClass}`} onClick={toggleMerged}>
            {rotate.merged ? t("settings.splitToTwo") : t("settings.mergeToSingle")}
          </button>

          {/* スタイル切替
              横長分け=上センター, 横長重ね=右上（1ふんもどすと同じ縦ライン）
              縦長分け=左センター, 縦長重ね=左下寄り */}
          <button
            class={
              "fixed z-50 " +
              (isLandscape()
                ? (rotate.merged
                    ? "left-[82%] top-2 -translate-x-1/2"
                    : "left-1/2 top-2 -translate-x-1/2")
                : (rotate.merged
                    ? "left-2 top-[80%] -translate-y-1/2"
                    : "left-2 top-1/2 -translate-y-1/2")) +
              " " + btnClass
            }
            style={{
              transition: moveTransition + ", " + dimTransition,
              opacity: buttonsDimmed() ? 0.08 : 1,
              "view-transition-name": "clock-left-slot",
            }}
            onClick={toggleRotateStyle}
          >
            {rotate.style === "crank"
              ? t("settings.styleToDrag")
              : t("settings.styleToCrank")}
          </button>

          {/* 1ふんもどす
              横長分け=下センター, 横長重ね=右下寄り（てまわしと同じ縦ライン）
              縦長分け=右センター, 縦長重ね=右下寄り
              縦横アニメ用に left+top+transform で統一
              長押しで連続 */}
          <button
            class={
              "fixed z-50 " +
              (isLandscape()
                ? (rotate.merged
                    ? "left-[82%] top-[calc(100%-0.5rem)] -translate-x-1/2 -translate-y-full"
                    : "left-1/2 top-[calc(100%-0.5rem)] -translate-x-1/2 -translate-y-full")
                : (rotate.merged
                    ? "left-[calc(100%-0.5rem)] top-[80%] -translate-x-full -translate-y-1/2"
                    : "left-[calc(100%-0.5rem)] top-1/2 -translate-x-full -translate-y-1/2")) +
              " " + btnClass
            }
            style={{
              "touch-action": "none",
              transition: moveTransition + ", " + dimTransition,
              opacity: buttonsDimmed() ? 0.08 : 1,
              "view-transition-name": "clock-right-slot",
            }}
            onPointerDown={startRewind}
            onPointerUp={stopRewind}
            onPointerCancel={stopRewind}
          >
            {t("settings.rewindMinute")}
          </button>

          {/* 右下: らんだむ（押すたびに15分刻みの別時刻へ） */}
          <button
            class={`fixed bottom-2 right-2 z-50 ${btnClass}`}
            onClick={randomizeRotate}
          >
            {t("settings.random")}
          </button>
        </Show>
      </Show>

      {/* ===== 通常モードUI（自由回転時は非表示） ===== */}
      <Show when={!rotate.active}>
        {/* 左上: 24h / 12h */}
        <button class={`fixed top-2 left-2 z-50 ${btnClass}`} onClick={toggleTimeFormat}>
          {settings.timeFormat === "24h" ? t("settings.hour12") : t("settings.hour24")}
        </button>

        {/* 左下: くわしく / すっきり */}
        <button class={`fixed bottom-2 left-2 z-50 ${btnClass}`} onClick={toggleDetailMode}>
          {settings.detailMode === "kuwashiku" ? t("settings.sukkiri") : t("settings.kuwashiku")}
        </button>

        {/* 右下: くぎり / ばっじ */}
        <button class={`fixed bottom-2 right-2 z-50 ${btnClass}`} onClick={toggleColorMode}>
          {settings.colorMode === "sector" ? t("settings.badge") : t("settings.sector")}
        </button>

        {/* 次パレット名ボタン: ポートレート=右センター, ランドスケープ=下センター */}
        <button
          class={
            "fixed z-50 " +
            (isLandscape()
              ? "bottom-2 left-1/2 -translate-x-1/2"
              : "right-2 top-1/2 -translate-y-1/2") +
            " " + btnClass
          }
          style={{ "view-transition-name": "clock-right-slot" }}
          onClick={cyclePalette}
        >
          {t(`palette.${getNextPalette(settings.paletteId).id}` as never)}
        </button>
      </Show>
    </>
  );
};

export default SettingsPanel;
