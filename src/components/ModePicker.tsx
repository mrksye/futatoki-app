import { For, Show, type Component } from "solid-js";
import { useI18n } from "../i18n";
import { clockMode, transition, type ClockMode } from "../features/free-rotation/state";
import type { TKey } from "../i18n";
import ModeIcon from "./icons/ModeIcon";
import {
  activePopover,
  closeActivePopover,
  togglePopover,
} from "../lib/exclusive-popover";
import { inPilotMode } from "../features/zusatz_pilot-mode";

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
  { mode: "timer", labelKey: "mode.timer" },
];

/** 1 ボタンあたりの stagger 間隔。展開時は上から、たたみ時は下から消えるよう delay を逆順に
 *  振り直す (= 一番下のボタンが last in / first out)。 */
const STAGGER_MS = 50;

/**
 * 左上の「もーど」トリガー + FAB 風縦展開。たたんだ状態は 1 ボタンだけ、押すと自動/自由/とけい の
 * 3 ボタンが縦に slide+fade で展開される。展開中のメニューは絶対配置で trigger 直下に重ねるので
 * たたみ時のレイアウト占有はゼロ。
 *
 * 外側タップで close するのは、展開中だけマウントする透明 overlay で吸収する (SettingsPopover と
 * 同型の機構)。document level pointerdown listener は pointerdown を伝播させてしまい時計・回転モード
 * 等の下層要素を意図せず発火させるので使わない。overlay の z は z-[55] で他 floating ボタン
 * (RotationActions / AM/PM badge 等、軒並み z-50 以下) より上に置き、popover content/trigger
 * (z-[60]) より下、language picker overlay (z-[100]) より下に位置取る (SettingsPopover overlay と
 * 同層)。
 *
 * SettingsPopover と同 z 階層なので overlay の物理遮蔽だけでは排他にならず、両 popover の open 状態
 * は exclusive-popover.ts の共有 signal で 1 つだけに制限する (別 popover を開くと自動的に閉じる)。
 */
const ModePicker: Component = () => {
  const { t } = useI18n();

  const expanded = () => activePopover() === "mode";
  const close = closeActivePopover;
  const toggle = () => togglePopover("mode");

  /** 展開中の 3 モードボタン用 (ラベルテキスト pill 形)。 */
  const baseClass =
    "px-2.5 py-1 tablet:px-6 tablet:py-4 rounded-full text-base tablet:text-xl font-bold shadow-md active:scale-90 transition-all whitespace-nowrap";
  const inactiveClass = "bg-white/80 text-gray-700";
  const activeClass = "bg-gray-800 text-white";

  /** トリガー専用 (SettingsPopover の歯車ボタンと対の丸アイコン FAB)。 */
  const triggerClass =
    "w-10 h-10 tablet:w-12 tablet:h-12 rounded-full bg-white/80 shadow-md flex items-center justify-center active:scale-90 transition-all text-gray-700 before:hidden";

  const select = (target: ClockMode) => {
    goMode(target);
    closeActivePopover();
  };

  return (
    <>
      {/* 展開中だけ mount する外側タップ吸収用の透明 overlay。pointerdown を吸って下層要素
          (時計・RotationActions 等) の誤発火を防ぐ。tap (= pointerup → click) で close。 */}
      <Show when={expanded()}>
        <div
          class="fixed inset-0 z-[55]"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={close}
        />
      </Show>

      {/* trigger + 展開メニューの container。trigger 本体しか占有しない (展開メニューは absolute)
          ので container 自身に onClick={close} を載せても発火するのは trigger 領域だけ。trigger
          ボタンと展開メニューの onClick は stopPropagation で各々の役割 (toggle / select) を保つ。 */}
      <div
        class="fixed top-[var(--safe-edge-top)] left-[var(--safe-edge-left)] z-[60]"
        onClick={() => { if (expanded()) close(); }}
      >
        <button
          class={triggerClass}
          aria-label={t("mode.picker")}
          onClick={(e) => { e.stopPropagation(); toggle(); }}
        >
          <ModeIcon class="w-5 h-5 tablet:w-6 tablet:h-6" />
        </button>

        {/* 展開メニューの wrapper。子ボタンは fade-out transition のために常時マウントしてる
            (Show でアンマウントすると enter 時の opacity 0 → 1 補間が走らない) ので、collapsed 時
            にこの wrapper 領域が下層 (clock のジェスチャ / 別 popover の overlay close) のタップを
            吸ってしまわないよう wrapper 自身も pointer-events: none に倒す。子ボタン側の
            pointer-events 切替は staggered fade と同じく個別管理で残す (フェード途中で押せない/
            押せるの境界が visual と一致するように)。 */}
        <div
          class="absolute top-full left-0 mt-2 flex flex-col gap-2 items-start"
          style={{ "pointer-events": expanded() ? "auto" : "none" }}
          onClick={(e) => e.stopPropagation()}
        >
          <For each={ITEMS.filter((it) => it.mode !== "timer" || inPilotMode())}>
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
    </>
  );
};

export default ModePicker;
