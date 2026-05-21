import { createSignal, For, onCleanup, onMount, type Component } from "solid-js";
import { useI18n } from "../i18n";
import { clockMode, transition, type ClockMode } from "../features/free-rotation/state";
import type { TKey } from "../i18n";

/** clock からは freeRotate にしか transition できない FSM ルール (state.ts の ALLOWED_TRANSITIONS)
 *  を満たすため、autoRotate を選んだ時は freeRotate を経由する。 */
const goMode = (target: ClockMode) => {
  const current = clockMode();
  if (current === target) return;
  if (target === "autoRotate" && current === "clock") {
    transition("freeRotate");
  }
  transition(target);
};

type ModeItem = { mode: ClockMode; labelKey: TKey };
const ITEMS: ModeItem[] = [
  { mode: "clock", labelKey: "mode.clock" },
  { mode: "freeRotate", labelKey: "mode.free" },
  { mode: "autoRotate", labelKey: "mode.auto" },
];

/** 1 ボタンあたりの stagger 間隔。展開時は上から、たたみ時は下から消えるよう delay を逆順に
 *  振り直す (= 一番下のボタンが last in / first out)。 */
const STAGGER_MS = 50;

/** 左上の「もーど」トリガー + FAB 風展開。たたんだ状態は 1 ボタンだけ、押すと自動/自由/とけい の
 *  3 ボタンが縦に slide+fade で展開される。展開中のメニューは絶対配置で trigger 直下に重ねるので
 *  たたみ時のレイアウト占有はゼロ。SettingsPopover と同型の開閉挙動 (外側 pointerdown で close、
 *  内側操作系は onClick で発火) を踏襲する。 */
const ModePicker: Component = () => {
  const { t } = useI18n();
  const [expanded, setExpanded] = createSignal(false);

  let containerRef: HTMLDivElement | undefined;

  const onDocPointerDown = (e: PointerEvent) => {
    if (!expanded()) return;
    if (containerRef && !containerRef.contains(e.target as Node)) setExpanded(false);
  };

  onMount(() => document.addEventListener("pointerdown", onDocPointerDown));
  onCleanup(() => document.removeEventListener("pointerdown", onDocPointerDown));

  const baseClass =
    "px-2.5 py-1 tablet:px-6 tablet:py-4 rounded-full text-base tablet:text-xl font-bold shadow-md active:scale-90 transition-all whitespace-nowrap";
  const inactiveClass = "bg-white/80 text-gray-700";
  const activeClass = "bg-gray-800 text-white";

  const select = (target: ClockMode) => {
    goMode(target);
    setExpanded(false);
  };

  return (
    <div
      ref={(el) => (containerRef = el)}
      class="fixed top-[var(--safe-edge-top)] left-[var(--safe-edge-left)] z-50"
    >
      <button
        class={`${baseClass} ${inactiveClass}`}
        aria-label={t("mode.picker")}
        onClick={() => setExpanded((o) => !o)}
      />

      <div class="absolute top-full left-0 mt-2 flex flex-col gap-2 items-start">
        <For each={ITEMS}>
          {(it, idx) => (
            <button
              class={`${baseClass} ${clockMode() === it.mode ? activeClass : inactiveClass}`}
              onClick={() => select(it.mode)}
              aria-label={t(it.labelKey)}
              style={{
                opacity: expanded() ? 1 : 0,
                transform: expanded()
                  ? "translateY(0) scale(1)"
                  : "translateY(-8px) scale(0.85)",
                transition:
                  "opacity 180ms ease-out, transform 220ms cubic-bezier(0.34, 1.56, 0.64, 1)",
                "transition-delay": `${
                  (expanded() ? idx() : ITEMS.length - 1 - idx()) * STAGGER_MS
                }ms`,
                "pointer-events": expanded() ? "auto" : "none",
                "transform-origin": "top left",
              }}
            />
          )}
        </For>
      </div>
    </div>
  );
};

export default ModePicker;
