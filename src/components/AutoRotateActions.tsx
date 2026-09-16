import { For, Show, onCleanup, type Component, type JSX } from "solid-js";
import { useI18n, type TKey } from "../i18n";
import { clockMode } from "../features/free-rotation/state";
import {
  handFade,
  numeralEmphasis,
  selectHandFade,
  selectNumeralEmphasis,
  type HandFade,
  type NumeralEmphasis,
} from "../features/free-rotation/auto-rotate-view";
import {
  activePopover,
  closeActivePopover,
  togglePopover,
  type PopoverName,
} from "../lib/exclusive-popover";
import BoldIcon from "./icons/BoldIcon";
import EyeIcon from "./icons/EyeIcon";

/**
 * じどうかいてん (autoRotate) 中だけ下 2 隅に出る読み取り補助メニュー。
 *  - 下奥 (end, LTR では右下): B アイコン → 分数を大きく / 時数を大きく / なし
 *  - 下手前 (start, LTR では左下): 目のアイコン → ながいはり / みじかいはり / りょうほう
 *
 * 同じ隅を じゆうかいてん の かさねる/らんだむ (RotationActions) と分け合うが、あちらは
 * freeRotate 中しか出ないので両者が同時に居ることはない。
 *
 * メニューは trigger の上へ展開する (下隅に居るので下は画面外)。ModePicker と同じく常時マウント
 * して opacity + transform を transition させ、collapsed 時は pointer-events: none で領域を消す。
 * stagger は trigger に近い側 (= 一番下のボタン) から開き、たたむ時は逆順に消える。
 */

type MenuItem<V extends string> = { value: V; labelKey: TKey };

const EMPHASIS_ITEMS: readonly MenuItem<NumeralEmphasis>[] = [
  { value: "minute", labelKey: "autoRotate.emphasisMinute" },
  { value: "hour", labelKey: "autoRotate.emphasisHour" },
  { value: "none", labelKey: "autoRotate.normal" },
];

/**
 * 針のメニューだけはラベルと値が入れ替わる。ラベルは「読むために残す針」を名乗り、HandFade の値は
 * 「薄める針」なので、ながいはりを選んだら短針 (hour) が薄くなる。子どもは残る針を選ぶのであって
 * 消す針を選ぶのではない、という読み方に表示を合わせてある。
 */
const HAND_FADE_ITEMS: readonly MenuItem<HandFade>[] = [
  { value: "hour", labelKey: "autoRotate.handLong" },
  { value: "minute", labelKey: "autoRotate.handShort" },
  { value: "none", labelKey: "autoRotate.handsBoth" },
];

/** 1 ボタンあたりの stagger 間隔。ModePicker と揃える。 */
const STAGGER_MS = 50;

/** 展開中のオプションボタン (ラベルテキスト pill 形)。ModePicker のメニューと同寸法。 */
const ITEM_CLASS =
  "px-2.5 py-1 tablet:px-6 tablet:py-4 rounded-full text-base tablet:text-xl font-bold shadow-md active:scale-90 transition-all whitespace-nowrap";
const ITEM_INACTIVE_CLASS = "bg-white/80 text-gray-700";
const ITEM_ACTIVE_CLASS = "bg-gray-800 text-white";

/** トリガー専用の丸アイコン FAB。ModePicker / SettingsPopover のトリガーと同寸法。 */
const TRIGGER_CLASS =
  "w-10 h-10 tablet:w-12 tablet:h-12 rounded-full bg-white/80 shadow-md flex items-center justify-center active:scale-90 transition-all text-gray-700 before:hidden";

interface CornerMenuProps<V extends string> {
  /** 配置する下隅。読み方向に追従する論理側 (start = LTR の左)。 */
  side: "start" | "end";
  popover: PopoverName;
  triggerLabelKey: TKey;
  icon: JSX.Element;
  items: readonly MenuItem<V>[];
  current: () => V;
  onSelect: (value: V) => void;
}

function CornerMenu<V extends string>(props: CornerMenuProps<V>): JSX.Element {
  const { t } = useI18n();

  const expanded = () => activePopover() === props.popover;
  const isStart = () => props.side === "start";

  // じどうかいてんを抜けるとこの subtree ごと unmount されるが、共有 signal に残った open 状態は
  // そのままだと次にじどうかいてんへ入った瞬間メニューが開いた状態で現れる。unmount 時に自分の
  // 分だけ畳んでおく。
  onCleanup(() => {
    if (activePopover() === props.popover) closeActivePopover();
  });

  return (
    <>
      {/* 展開中だけ mount する外側タップ吸収用の透明 overlay。pointerdown を吸って下層要素
          (時計等) の誤発火を防ぐ。tap (= pointerup → click) で close。 */}
      <Show when={expanded()}>
        <div
          class="fixed inset-0 z-[55]"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={closeActivePopover}
        />
      </Show>

      {/* trigger + 展開メニューの container。trigger 本体しか占有しない (展開メニューは absolute)。 */}
      <div
        class={
          "fixed bottom-[var(--safe-edge-bottom)] z-[60] " +
          (isStart()
            ? "start-[var(--safe-edge-start)]"
            : "end-[var(--safe-edge-end)]")
        }
        onClick={() => { if (expanded()) closeActivePopover(); }}
      >
        <button
          class={TRIGGER_CLASS}
          aria-label={t(props.triggerLabelKey)}
          onClick={(e) => { e.stopPropagation(); togglePopover(props.popover); }}
        >
          {props.icon}
        </button>

        <div
          class={
            "absolute bottom-full mb-2 flex flex-col gap-2 " +
            (isStart() ? "start-0 items-start" : "end-0 items-end")
          }
          style={{ "pointer-events": expanded() ? "auto" : "none" }}
          onClick={(e) => e.stopPropagation()}
        >
          <For each={props.items}>
            {(item, idx) => (
              <button
                class={`${ITEM_CLASS} ${props.current() === item.value ? ITEM_ACTIVE_CLASS : ITEM_INACTIVE_CLASS}`}
                aria-label={t(item.labelKey)}
                onClick={() => { props.onSelect(item.value); closeActivePopover(); }}
                style={{
                  opacity: expanded() ? 1 : 0,
                  transform: expanded()
                    ? "translateY(0) scale(1)"
                    : "translateY(8px) scale(0.85)",
                  transition:
                    "opacity 180ms ease-out, transform 220ms cubic-bezier(0.34, 1.56, 0.64, 1)",
                  "transition-delay": `${
                    (expanded() ? props.items.length - 1 - idx() : idx()) * STAGGER_MS
                  }ms`,
                  "pointer-events": expanded() ? "auto" : "none",
                  "transform-origin": `bottom var(--chrome-${props.side}-origin-x)`,
                }}
              />
            )}
          </For>
        </div>
      </div>
    </>
  );
}

const AutoRotateActions: Component = () => (
  <Show when={clockMode() === "autoRotate"}>
    <CornerMenu
      side="end"
      popover="autoRotateEmphasis"
      triggerLabelKey="autoRotate.emphasis"
      icon={<BoldIcon class="w-5 h-5 tablet:w-6 tablet:h-6" />}
      items={EMPHASIS_ITEMS}
      current={numeralEmphasis}
      onSelect={selectNumeralEmphasis}
    />
    <CornerMenu
      side="start"
      popover="autoRotateHandFade"
      triggerLabelKey="autoRotate.visibleHand"
      icon={<EyeIcon class="w-5 h-5 tablet:w-6 tablet:h-6" />}
      items={HAND_FADE_ITEMS}
      current={handFade}
      onSelect={selectHandFade}
    />
  </Show>
);

export default AutoRotateActions;
