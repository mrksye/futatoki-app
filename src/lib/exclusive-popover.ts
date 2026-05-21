import { createSignal } from "solid-js";

/**
 * 画面に同時に開ける popover/メニューを 1 つに制限する共有 signal。SettingsPopover (右上歯車) と
 * ModePicker (左上モードアイコン) のように同種 FAB が複数走るとき、両方を同時に開けてしまうと
 * UI が散らかる。両 popover は同じ z 階層 (overlay z-[55] / content z-[60]) で運用されているため
 * overlay の物理遮蔽では排他にならず、open 状態をここに一極集中で持つ。別 popover を toggle すると
 * active が上書きされ、前に開いていた popover の派生 accessor (open() / expanded()) が false に倒れて
 * 勝手に閉じる仕組み。
 */
export type PopoverName = "settings" | "mode";

const [active, setActive] = createSignal<PopoverName | null>(null);

/** 現在 active な popover 名。null なら全閉。 */
export const activePopover = active;

/** 指定 popover を active に切替える。同名なら toggle (= 閉じる)、別名/null なら open。
 *  別 popover が既に open でも上書きするので、トリガー連打しても 1 つしか開かない。 */
export const togglePopover = (name: PopoverName): void => {
  setActive((current) => (current === name ? null : name));
};

/** active な popover を閉じる (= active を null に)。overlay タップ等から呼ぶ。 */
export const closeActivePopover = (): void => {
  setActive(null);
};
