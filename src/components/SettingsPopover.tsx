import { Show, For, type Component } from "solid-js";
import { useI18n } from "../i18n";
import {
  activePopover,
  closeActivePopover,
  togglePopover,
} from "../lib/exclusive-popover";
import { palettes } from "../colors";
import { colorMode, toggleColorMode } from "../features/settings/color-mode";
import { detailMode, toggleDetailMode } from "../features/settings/detail-mode";
import { timeFormat, toggleTimeFormat } from "../features/settings/time-format";
import { paletteId, selectPalette } from "../features/settings/palette";
import { knockingOnPilotModesDoor } from "../features/zusatz_pilot-mode";
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
import { openLanguagePickerAtElement } from "../features/language-picker/state";
import GearIcon from "./icons/GearIcon";

/**
 * はいしょく swatch に出す代表色の hour (24h)。
 * - default: 12 / 13 / 14 時 = pm[0] / pm[1] / pm[2] の 3 個並び。
 * - wheel (いろのわ): 12 色相環なので 3 個では色相サンプルが偏る。13 / 16 / 19 / 22 時
 *   = pm[1] / pm[4] / pm[7] / pm[10] = あか・き・みどり・あお の 4 個並び。
 *
 * swatch の合計幅は 3 個並び (= SWATCH_WIDTH_PX = 28px) に揃える。各 dot 間の距離は GAPS で
 * 個別指定し、`margin-left = gap - dot 直径` を inline style に流す (負値 = overlap)。
 * 左の dot ほど z-index が高いので、ある dot の「見える幅」≒ 次 dot 左端までの距離 = その gap。
 * wheel は均等 (16/3 ≒ 5.33px ずつ) からミクロンだけ黄・緑を詰め、その分青を広く取る:
 * [赤→黄 5px, 黄→緑 5px, 緑→青 6px] → 黄 5px / 緑 5px / 青 6px の領域配分。
 */
const SWATCH_INDICES_DEFAULT = [0, 1, 2] as const;
const SWATCH_INDICES_WHEEL = [1, 4, 7, 10] as const;
const SWATCH_DOT_PX = 12; // w-3
const SWATCH_GAPS_DEFAULT = [8, 8] as const;
const SWATCH_GAPS_WHEEL = [5, 5, 6] as const;

/** ライセンス表記ページ。build-tools/build-licenses.ts が同一 origin に生成する。 */
const LICENSES_PATH = "/licenses.html";

/**
 * 右上の歯車トリガー + 展開パネル。
 *
 * - パネル内は はいしょく / ぶんけい / じすう / じかんひょうき / すうじ / 言語選択 を並べ、
 *   最下部に罫線で区切ってライセンス表記 (/licenses.html) へのリンクを置く。
 * - popover content は常時マウントし、open 切替時に opacity + transform を transition させて
 *   fade/scale in-out する (ModePicker 同型)。Show でアンマウントすると enter 時の補間が走らない。
 *   content は absolute 配置で trigger 直下に重ねるので、collapsed 時のレイアウト占有はゼロ。
 *   closed 時は `pointer-events: none` で下層要素 (時計・他 popover の overlay close 等) の
 *   タップを吸わないよう切る。
 * - popover 外タップで close するのは、popover 開いてる間だけマウントする透明 overlay で吸収する。
 *   document level pointerdown listener は pointerdown を伝播させてしまい時計・ModePicker・回転
 *   モード等の下層要素を意図せず発火させるので使わない。overlay の z は z-[55] で他 floating
 *   ボタン (RotationActions / AM/PM badge 等、軒並み z-50 以下) より上に置き、popover content/
 *   trigger (z-[60]) より下、language picker overlay (z-[100]) より下に位置取る。
 * - ModePicker と同 z 階層なので overlay の物理遮蔽だけでは排他にならず、両 popover の open 状態は
 *   exclusive-popover.ts の共有 signal で 1 つだけに制限する (別 popover を開くと自動的に閉じる)。
 * - language picker open 中は z-[100] の language picker overlay が前面に出るので popover overlay は
 *   隠れて何も拾わず、ピッカーを閉じても popover はそのまま開いた状態が維持される。
 * - autoRotate (子どもが眺めるモード) 中も常時表示する方針: ModePicker と同じく「いつでも
 *   触れる」UX を優先する。
 * - ラベル描画は index.css の `button[aria-label]::before` 規約に従う。アイコン (歯車 SVG や
 *   🌏) や 色 dot 等 DOM children が必要なボタンだけ `before:hidden` で疑似要素を抑制する。
 * - popover 内の操作系ボタンは onClick (= pointerup でキャンセル可能) に統一する。pointerdown
 *   即発火は誤タップ取消ができないので子供向け UI として避ける。
 */
const SettingsPopover: Component = () => {
  const { t, locale, formatNumeral } = useI18n();

  const open = () => activePopover() === "settings";
  const close = closeActivePopover;
  const toggle = () => togglePopover("settings");

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
    <>
      {/* popover 外タップ吸収用の透明 overlay。pointerdown を吸って下層要素 (時計・ModePicker・
          回転モード等) の誤発火を防ぐ。tap (= pointerup → click) で popover close。 */}
      <Show when={open()}>
        <div
          class="fixed inset-0 z-[55]"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={close}
        />
      </Show>

    {/* container は fixed で trigger サイズだけ占有 (popover content は absolute で trigger
        直下右寄せ)。trigger と popover content の onClick はそれぞれ stopPropagation で各々の
        役割 (toggle / 設定操作) を保つ。container 自身の onClick={close} は ModePicker と機構を
        揃える保険 (実際の外タップ close は overlay 経由で発火するので通常ここまで来ない)。 */}
    <div
      class="fixed top-[var(--safe-edge-top)] end-[var(--safe-edge-end)] z-[60]"
      onClick={() => { if (open()) close(); }}
    >
      <button
        class="w-10 h-10 tablet:w-12 tablet:h-12 rounded-full bg-white/80 shadow-md flex items-center justify-center active:scale-90 transition-all text-gray-700 before:hidden"
        aria-label={open() ? t("a11y.settingsClose") : t("a11y.settingsOpen")}
        onClick={(e) => { e.stopPropagation(); toggle(); }}
      >
        <GearIcon class="w-5 h-5 tablet:w-6 tablet:h-6" />
      </button>

      {/* popover content は常時マウントして open() 連動で opacity + transform を transition。
          ModePicker のメニュー stagger と ease curve を揃え、transform-origin は trigger 直下の
          top right に置いて歯車から開いてくる感じを出す。closed 時は pointer-events: none で
          領域を実質的に消す (下層 overlay の close click が通るように)。 */}
        <div
          class="absolute top-full end-0 mt-2 bg-white/95 backdrop-blur-sm rounded-2xl shadow-xl p-3 tablet:p-4 max-h-[80vh] overflow-y-auto min-w-[240px] max-w-[320px] tablet:min-w-[280px] tablet:max-w-[400px]"
          style={{
            // absolute 配置だと width: auto = shrink-to-fit が containing block (= trigger サイズ
            // 数十 px) に引きずられて min-width 下限に張り付く。max-content にすると containing
            // block と無関係に中身の intrinsic max content width で算出され、その上で min/max-width
            // 制約 (class 側で tablet breakpoint 込みで指定) が clamp として効く。これで pillBtn
            // 系と同じ tablet ブレークポイントで popover 全体も一段広がる。
            width: "max-content",
            opacity: open() ? 1 : 0,
            transform: open()
              ? "translateY(0) scale(1)"
              : "translateY(-8px) scale(0.92)",
            transition:
              "opacity 180ms ease-out, transform 220ms cubic-bezier(0.34, 1.56, 0.64, 1)",
            "pointer-events": open() ? "auto" : "none",
            "transform-origin": "top var(--chrome-end-origin-x)",
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* はいしょく */}
          <div class="mb-3">
            <div class={sectionLabelClass}>{t("section.color")}</div>
            <div class="grid grid-cols-2 gap-2">
              <For each={palettes}>
                {(p) => {
                  const isWheel = p.id === "wheel";
                  const indices = isWheel ? SWATCH_INDICES_WHEEL : SWATCH_INDICES_DEFAULT;
                  const gaps = isWheel ? SWATCH_GAPS_WHEEL : SWATCH_GAPS_DEFAULT;
                  return (
                  <button
                    class={`${pillBtn} flex items-center gap-1.5 before:hidden ${paletteId() === p.id ? pillActive : pillInactive}`}
                    aria-label={t(`palette.${p.id}` as never)}
                    onClick={() => { selectPalette(p.id); knockingOnPilotModesDoor(p.id); }}
                  >
                    {/* 三色 (wheel のみ四色) のミニ色見本。dot は負の margin-left で重ねており、これは
                        物理プロパティなので RTL の flex 主軸 (右→左) では重なりが逆辺に効いて間隔が
                        広がってしまう。色見本は方向非依存のサンプルなので dir=ltr に固定し、LTR と同一の
                        重なりで描画する。ボタン内での左右配置 (label との並び) は外側の flex が読み方向に
                        従うのでこの span 単位の固定で十分。 */}
                    <span dir="ltr" class="flex">
                      <For each={indices}>
                        {(i, idx) => (
                          <span
                            class={
                              "inline-block w-3 h-3 rounded-full border relative " +
                              // 白盤面 (ものとーん) は border-white だと dot が完全消失するので
                              // 内側に薄めの線で外形を見せる。外側の border を変えると ものとーん
                              // だけ円が大きく見えるので、border-transparent で寸法を揃えたうえで
                              // inner ring に切替える。inactive (白背景) は ring-black/30、active
                              // (黒反転背景) では ring-black/30 が背景に埋もれるので中間グレー
                              // ring-gray-400 に振り、両 state で同じ「グレーの線」感を維持する。
                              // 他 palette は隣接 dot 同士の重なりを区切るため border-white を保持。
                              (p.id === "monotone"
                                ? `border-transparent ring-1 ring-inset ${paletteId() === p.id ? "ring-gray-400" : "ring-black/30"}`
                                : "border-white")
                            }
                            style={{
                              "background-color": p.pm[i]!.bg,
                              // 隣接 dot との左端→左端距離を gap で個別指定。margin-left =
                              // gap - SWATCH_DOT_PX (負値が普通 = overlap)。3 個並びは均等
                              // (gap 8px = overlap 4px)、wheel は黄緑を詰めて青を広く取る。
                              "margin-left":
                                idx() === 0
                                  ? "0"
                                  : `${gaps[idx() - 1]! - SWATCH_DOT_PX}px`,
                              // 左の dot を手前に重ねる (document order だと右が前面に来てしまう)。
                              "z-index": String(indices.length - idx()),
                            }}
                          />
                        )}
                      </For>
                    </span>
                    <span>{t(`palette.${p.id}` as never)}</span>
                  </button>
                  );
                }}
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

          {/* すうじたいけい — 各 system + 「なし」(hidden) をラジオ式に並べる。bn 等の multi-system
              locale でも western/bengali を別 option として並列に出す。「なし」 option ラベルは
              各 locale の「なし / None / Aucun …」翻訳 (settings.noNumerals) をそのまま描画する。
              旧版は現在体系の「123」に line-through を引いた表現だったが、line-through は数字を
              否定する記号としては読みづらく (CJK や Arabic shaping で線位置が崩れる locale もある)、
              また打ち消し線の意味が「削除済み」とも取れて子供向け UI に向かなかったので素直に
              各言語の自然な「なし」語を出す。 */}
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
                aria-label={t("settings.noNumerals")}
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
                  ms-auto で行末 (LTR は右端 / RTL は左端) に押し出し、じかんひょうきトグルと視覚的に分離する。 */}
              <button
                class={`${pillBtn} ${pillInactive} ms-auto before:hidden`}
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

          {/* ライセンス表記への導線。self-host font と bundle 内の第三者ソフトウェアの著作権表示を
              /licenses.html (build 時生成) に置き、そこへの 1 タップだけをここに出す。設定 section
              群の外に罫線で切り離し、子どもが操作する対象ではない旨を視覚的に分ける。
              ラベルは SPDX / OFL の識別子そのままで翻訳キーを持たない: 遷移先の本文が英語原文
              単一 (訳を併記すると正文が曖昧になる) なので、ラベルだけ 20 locale 化しても
              読める先が増えるわけではない。識別子は Latin 固定文字列なので RTL でも並びが
              崩れないよう dir=ltr をピンする (色見本 dot と同じ扱い)。 */}
          <div class="mt-3 pt-2 border-t border-gray-200 text-center">
            <a
              href={LICENSES_PATH}
              target="_blank"
              rel="noopener noreferrer"
              dir="ltr"
              class="text-[10px] tablet:text-xs text-gray-400 hover:text-gray-600 no-underline"
            >
              MIT &middot; SIL OFL 1.1
            </a>
          </div>
        </div>
    </div>
    </>
  );
};

export default SettingsPopover;
