import { createSignal, onCleanup, onMount, Show, For, type Component } from "solid-js";
import { useI18n } from "../i18n";
import { palettes } from "../colors";
import { colorMode, toggleColorMode } from "../features/settings/color-mode";
import { detailMode, toggleDetailMode } from "../features/settings/detail-mode";
import { timeFormat, toggleTimeFormat } from "../features/settings/time-format";
import { paletteId, selectPalette } from "../features/settings/palette";
import {
  availableNumeralSystems,
  formatBySystem,
  resolveNumeralSystem,
  selectNumeralSystem,
  type NumeralSystem,
} from "../features/settings/numeral-system";
import {
  hourNumeralsHidden,
  setHourNumeralsHidden,
} from "../features/settings/nothing-digits-font";
import { languagePickerOpen, openLanguagePickerAtElement } from "../features/language-picker/state";

/** はいしょく swatch に出す代表色の hour (24h)。12 / 13 / 14 時 = pm[0] / pm[1] / pm[2]。 */
const SWATCH_PM_INDICES = [0, 1, 2] as const;

/** combining stroke (U+0336) を各 grapheme の後ろに挟んで「打消し」表示。すうじ「なし」option の
 *  preview ラベル用 (時数を隠す状態 = 「数字に消しゴム」)。 */
const strikethrough = (s: string): string =>
  Array.from(s).map((ch) => ch + "̶").join("");

/**
 * 右上の歯車トリガー + 展開パネル。
 *
 * - パネル内は はいしょく / ぶんけい / じすう / じかんひょうき / すうじ / 言語選択 を並べる。
 * - popover 外の pointerdown で自動 close。trigger と popover content の両方を 1 つの
 *   containerRef でラップして、内部 click は contains で守る。
 * - autoRotate (子どもが眺めるモード) 中も常時表示する方針: ModePicker と同じく「いつでも
 *   触れる」UX を優先する。
 * - ラベル描画は index.css の `button[aria-label]::before` 規約に従う。アイコン (⚙ や 🌏) や
 *   色 dot 等 DOM children が必要なボタンだけ `before:hidden` で疑似要素を抑制する。
 * - popover 内の操作系ボタンは onClick (= pointerup でキャンセル可能) に統一する。pointerdown
 *   即発火は誤タップ取消ができないので子供向け UI として避ける。
 */
const SettingsPopover: Component = () => {
  const { t, locale } = useI18n();
  const [open, setOpen] = createSignal(false);

  let containerRef: HTMLDivElement | undefined;

  const close = () => setOpen(false);
  const toggle = () => setOpen((o) => !o);

  const onDocPointerDown = (e: PointerEvent) => {
    if (!open()) return;
    // 言語ピッカーが出ている間は popover を維持する (popover 内の 🌏 ボタン経由で開いた前提で
    // 戻り先 = popover が消えてると遷移が不自然)。
    if (languagePickerOpen()) return;
    if (containerRef && !containerRef.contains(e.target as Node)) close();
  };

  onMount(() => document.addEventListener("pointerdown", onDocPointerDown));
  onCleanup(() => document.removeEventListener("pointerdown", onDocPointerDown));

  const pillBtn =
    "px-3 py-1 tablet:px-4 tablet:py-2 rounded-full text-sm tablet:text-base font-bold shadow-sm active:scale-90 transition-all whitespace-nowrap";
  const pillInactive = "bg-white text-gray-700 border border-gray-300";
  const pillActive = "bg-gray-800 text-white";

  const sectionLabelClass = "text-xs tablet:text-sm font-bold text-gray-600 mb-1";

  const numeralSystemActive = (s: NumeralSystem) =>
    !hourNumeralsHidden() && resolveNumeralSystem(locale().code) === s;
  const selectSystem = (s: NumeralSystem) => {
    setHourNumeralsHidden(false);
    selectNumeralSystem(locale().code, s);
  };

  return (
    <div
      ref={(el) => (containerRef = el)}
      class="fixed top-[var(--safe-edge-top)] right-[var(--safe-edge-right)] z-50 flex flex-col items-end gap-2"
    >
      <button
        class="w-10 h-10 tablet:w-12 tablet:h-12 rounded-full bg-white/80 shadow-md flex items-center justify-center active:scale-90 transition-all text-xl tablet:text-2xl before:hidden"
        aria-label={open() ? t("a11y.settingsClose") : t("a11y.settingsOpen")}
        onClick={toggle}
      >
        ⚙
      </button>

      <Show when={open()}>
        <div
          class="bg-white/95 backdrop-blur-sm rounded-2xl shadow-xl p-3 tablet:p-4 max-h-[80vh] overflow-y-auto"
          style={{ "min-width": "240px", "max-width": "320px" }}
        >
          {/* はいしょく */}
          <div class="mb-3">
            <div class={sectionLabelClass}>{t("section.color")}</div>
            <div class="grid grid-cols-2 gap-2">
              <For each={palettes}>
                {(p) => (
                  <button
                    class={
                      "flex items-center gap-1.5 px-2 py-1 rounded-full border active:scale-95 transition-all before:hidden " +
                      (paletteId() === p.id
                        ? "border-gray-800 bg-gray-100"
                        : "border-gray-200 bg-white")
                    }
                    aria-label={t(`palette.${p.id}` as never)}
                    onClick={() => selectPalette(p.id)}
                  >
                    <span class="flex">
                      <For each={SWATCH_PM_INDICES}>
                        {(i, idx) => (
                          <span
                            class={
                              "inline-block w-3 h-3 rounded-full border -ml-1 first:ml-0 relative " +
                              // 白盤面 (ものとーん) は border-white だと dot が完全消失するので
                              // 内側に薄めの黒線で外形を見せる。外側の border を黒に変えると
                              // ものとーんだけ円が大きく見えるので、border-transparent で寸法を
                              // 揃えたうえで inner ring に切替える。他 palette は隣接 dot 同士の
                              // 重なりを区切るため border-white を保持。
                              (p.id === "monotone"
                                ? "border-transparent ring-1 ring-inset ring-black/30"
                                : "border-white")
                            }
                            style={{
                              "background-color": p.pm[i]!.bg,
                              // 左の dot を手前に重ねる (document order だと右が前面に来てしまう)。
                              "z-index": String(SWATCH_PM_INDICES.length - idx()),
                            }}
                          />
                        )}
                      </For>
                    </span>
                    <span class="text-xs tablet:text-sm">
                      {t(`palette.${p.id}` as never)}
                    </span>
                  </button>
                )}
              </For>
            </div>
          </div>

          {/* ぶんけい */}
          <div class="mb-3">
            <div class={sectionLabelClass}>{t("section.detail")}</div>
            <div class="flex gap-1">
              <button
                class={`${pillBtn} ${detailMode() === "sukkiri" ? pillActive : pillInactive}`}
                aria-label={t("settings.sukkiri")}
                onClick={() => {
                  if (detailMode() !== "sukkiri") toggleDetailMode();
                }}
              />
              <button
                class={`${pillBtn} ${detailMode() === "kuwashiku" ? pillActive : pillInactive}`}
                aria-label={t("settings.kuwashiku")}
                onClick={() => {
                  if (detailMode() !== "kuwashiku") toggleDetailMode();
                }}
              />
            </div>
          </div>

          {/* じすう */}
          <div class="mb-3">
            <div class={sectionLabelClass}>{t("section.digit")}</div>
            <div class="flex gap-1">
              <button
                class={`${pillBtn} ${colorMode() === "badge" ? pillActive : pillInactive}`}
                aria-label={t("settings.badge")}
                onClick={() => {
                  if (colorMode() !== "badge") toggleColorMode();
                }}
              />
              <button
                class={`${pillBtn} ${colorMode() === "sector" ? pillActive : pillInactive}`}
                aria-label={t("settings.sector")}
                onClick={() => {
                  if (colorMode() !== "sector") toggleColorMode();
                }}
              />
            </div>
          </div>

          {/* すうじ — 各 system + 「なし」(hidden) をラジオ式に並べる。bn 等の multi-system locale
              でも western/bengali を別 option として並列に出す。なし option ラベルは現在体系の
              「123」に combining stroke を被せた打消し表現。 */}
          <div class="mb-3">
            <div class={sectionLabelClass}>{t("section.numeral")}</div>
            <div class="flex gap-1">
              <For each={availableNumeralSystems(locale().code)}>
                {(s) => (
                  <button
                    class={`${pillBtn} ${numeralSystemActive(s) ? pillActive : pillInactive}`}
                    aria-label={formatBySystem(s, 123)}
                    onClick={() => selectSystem(s)}
                  />
                )}
              </For>
              <button
                class={`${pillBtn} ${hourNumeralsHidden() ? pillActive : pillInactive}`}
                aria-label={strikethrough(
                  formatBySystem(resolveNumeralSystem(locale().code), 123),
                )}
                onClick={() => setHourNumeralsHidden(true)}
              />
            </div>
          </div>

          {/* じかんひょうき — 12h/24h トグル + 行末右端に言語選択 (🌏) を間を空けて置く。
              popover 内最後の section。 */}
          <div>
            <div class={sectionLabelClass}>{t("section.timeFormat")}</div>
            <div class="flex gap-1 items-center">
              <button
                class={`${pillBtn} ${timeFormat() === "12h" ? pillActive : pillInactive}`}
                aria-label={t("settings.hour12")}
                onClick={() => {
                  if (timeFormat() !== "12h") toggleTimeFormat();
                }}
              />
              <button
                class={`${pillBtn} ${timeFormat() === "24h" ? pillActive : pillInactive}`}
                aria-label={t("settings.hour24")}
                onClick={() => {
                  if (timeFormat() !== "24h") toggleTimeFormat();
                }}
              />
              {/* 言語選択 (🌏 のみ)。タップで言語ピッカー (リング) が開くが popover は閉じない:
                  ピッカーを閉じた直後に popover が消えてると「戻り先」が見えない違和感が出るため。
                  ml-auto で行末右端に押し出し、じかんひょうきトグルと視覚的に分離する。 */}
              <button
                class={`${pillBtn} ${pillInactive} ml-auto before:hidden`}
                aria-label={t("a11y.languagePicker")}
                onClick={(e) => {
                  const btn = e.currentTarget as HTMLButtonElement;
                  openLanguagePickerAtElement(btn);
                }}
              >
                🌏
              </button>
            </div>
          </div>
        </div>
      </Show>
    </div>
  );
};

export default SettingsPopover;
