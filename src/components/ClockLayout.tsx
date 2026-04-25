import { createMemo, createSignal, onCleanup, Show } from "solid-js";
import type { Component, ParentComponent } from "solid-js";
import ClockFace from "./ClockFace";
import HandsLayer from "./HandsLayer";
import ScheduleLayer from "./ScheduleLayer";
import SchedulePicker from "./SchedulePicker";
import SecondsBar from "./SecondsBar";
import SettingsPanel from "./SettingsPanel";
import SkyBackground from "./SkyBackground";
import { useCurrentTime } from "../hooks/useCurrentTime";
import { useOrientation } from "../hooks/useOrientation";
import { rotateActive, rotateMinutes, rotateMode, seekRotate, setRotateMode } from "../features/free-rotation/state";
import { useAutoRotateTick } from "../features/free-rotation/auto-rotate";
import {
  useMergeAnimation,
  amTransform,
  pmTransform,
  mergedTransform,
  splitShadow,
} from "../features/free-rotation/merge-animation";
import { useAmPmPreviewHold } from "../features/am-pm-preview";
import { MORPHING_SLOT } from "../features/view-transition";
import { useI18n } from "../i18n";
import { dragStart, dragAdvance, type DragDragState } from "../features/free-rotation/drag";

type DragState = DragDragState;

/**
 * dim 用 absolute オーバーレイ。ClockFace / HandsLayer を opacity transition で薄くするための
 * 包み div を 1 箇所に閉じ込めた component。
 *
 * pointer-events-none は構造的に必須 (= ここに閉じ込めている本来の理由):
 *   この div は ScheduleLayer の上に absolute inset-0 で乗るため、デフォルトの pointer-events: auto
 *   のままだと予定アイコンへの pointer が全部この空 box で止まってしまう (= タップが効かない)。
 *   過去にこのバグを踏んだので、call site で class を組み立てる方式から component に移行した。
 */
const DimOverlay: ParentComponent<{ opacity: number }> = (props) => (
  <div
    class="absolute inset-0 fade-on-dim pointer-events-none"
    style={{ opacity: props.opacity }}
  >
    {props.children}
  </div>
);

export const ClockLayout: Component = () => {
  const time = useCurrentTime();
  const isLandscape = useOrientation();
  const { t } = useI18n();

  // 表示用の時刻 (自由回転時は rotateMinutes、通常時はリアル時刻)
  const displayed = createMemo(() => {
    if (rotateActive()) {
      const m = rotateMinutes();
      return { hours: Math.floor(m / 60), minutes: m % 60, seconds: 0 };
    }
    return time();
  });

  // 予定アイコンとのマッチ判定用に丸めた整数分 (0..1439)。
  // 自由回転 (auto/drag) では rotateMinutes が小数になるので Math.round で四捨五入。
  const displayedMinutesTotal = createMemo(() => {
    const d = displayed();
    return ((d.hours * 60 + Math.round(d.minutes)) % 1440 + 1440) % 1440;
  });

  // AM/PM バッジ長押しで反対側プレビュー
  const actualIsAm = createMemo(() => displayed().hours < 12);
  const { isAm, startHold, clearHold } = useAmPmPreviewHold(actualIsAm);
  // 押下中だけ opacity 切替を即時に (戻すときは通常の 380ms フェード)。
  // .opacity-instant 修飾クラス経由で実現 (index.css 参照)。
  const previewFlipped = createMemo(() => isAm() !== actualIsAm());

  const amTime = createMemo(() => ({
    hours: displayed().hours % 12,
    minutes: displayed().minutes,
  }));

  const pmTime = createMemo(() => ({
    hours: displayed().hours % 12,
    minutes: displayed().minutes,
  }));

  // ===== 自由回転ドラッグ (requestAnimationFrame で間引きして低性能端末でも滑らかに) =====
  let amWrapperRef: HTMLDivElement | undefined;
  let pmWrapperRef: HTMLDivElement | undefined;
  // dragRef は高頻度 pointermove で書き換わる。signal にせず直接 mutate して allocation を抑える。
  let dragRef: DragState | null = null;
  const [dragging, setDragging] = createSignal(false);
  let pendingMinutes: number | null = null;
  let rafId: number | null = null;

  const commitPending = () => {
    rafId = null;
    if (pendingMinutes !== null) {
      seekRotate(pendingMinutes);
      pendingMinutes = null;
    }
  };

  const schedule = (m: number) => {
    pendingMinutes = m;
    if (rafId === null) rafId = requestAnimationFrame(commitPending);
  };

  const onDragStart = (e: PointerEvent) => {
    if (!rotateActive()) return;
    // 自動回転中の背景タップ → manual に切り替えて止める
    // (SettingsPanel の左下「すとっぷ」ボタンを押すのと同等の操作)
    if (rotateMode() === "auto") {
      setRotateMode("manual");
      return;
    }
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragRef = dragStart(e, rotateMinutes());
    setDragging(true);
  };

  const onDragMove = (e: PointerEvent) => {
    const s = dragRef;
    if (!s || e.pointerId !== s.pointerId) return;
    schedule(dragAdvance(e, s));
  };

  const onDragEnd = (e: PointerEvent) => {
    const s = dragRef;
    if (!s || e.pointerId !== s.pointerId) return;
    const el = e.currentTarget as HTMLElement;
    if (el.hasPointerCapture?.(e.pointerId)) el.releasePointerCapture(e.pointerId);
    dragRef = null;
    setDragging(false);
    // 保留中の更新を即反映
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
    if (pendingMinutes !== null) {
      seekRotate(pendingMinutes);
      pendingMinutes = null;
    }
  };

  onCleanup(() => {
    if (rafId !== null) cancelAnimationFrame(rafId);
  });

  // ===== かさね/わけ アニメーションと自動回転 =====
  const { mergedVisible, transitioning } = useMergeAnimation();
  useAutoRotateTick();

  // ClockFace / HandsLayer 用の dim opacity (3 状態合成):
  //   - merged 表示中 → 0 (split 時計は隠す)
  //   - 反対側プレビュー長押し中 → 0.25 (薄く)
  //   - 通常 → 1
  // ScheduleLayer は dim 階層の外に置いて、内部で event ごとに opacity を決める (window 内は dim 無視)。
  const amDimOpacity = createMemo(() => mergedVisible() ? 0 : (isAm() ? 1 : 0.25));
  const pmDimOpacity = createMemo(() => mergedVisible() ? 0 : (isAm() ? 0.25 : 1));

  return (
    <div class="w-full h-full overflow-hidden relative">
      {/* 空背景 (自由回転時のみ) */}
      <Show when={rotateActive()}>
        <SkyBackground totalMinutes={rotateMinutes()} />
      </Show>

      {/* 時計コンテナ (自由回転時はここがドラッグ領域) */}
      <div
        class={"absolute inset-0 flex items-stretch " + (isLandscape() ? "flex-row" : "flex-col")}
        style={{
          "touch-action": rotateActive() && rotateMode() === "manual" ? "none" : "auto",
          cursor:
            rotateActive() && rotateMode() === "manual"
              ? (dragging() ? "grabbing" : "grab")
              : "default",
        }}
        onPointerDown={onDragStart}
        onPointerMove={onDragMove}
        onPointerUp={onDragEnd}
        onPointerCancel={onDragEnd}
      >
        {/* AM (ドラッグ中は裏時計を描画しない=重い opacity レイヤーも消える)
            負マージンで中央方向に少しオーバーラップ→盤面サイズは保ちつつ
            四隅にボタンスペースを確保 */}
        <div
          ref={amWrapperRef}
          class={
            "clock-wrapper-transition relative flex-1 flex flex-col items-center justify-center min-h-0 min-w-0 " +
            (isLandscape() ? "-mr-3" : "-mb-3")
          }
          classList={{ "opacity-instant": previewFlipped() }}
          style={{
            transform: amTransform(mergedVisible(), isLandscape()),
            // wrapper 自身の opacity は外した: ClockFace / HandsLayer は内側 dim div で個別に薄く、
            // ScheduleLayer は dim 階層の外に置いて event ごとに opacity を制御する。
            // これで「window 内の予定」は薄い側 (PM プレビュー時の AM など) でもハッキリ見える。
            // .opacity-instant 中は子の .fade-on-dim が CSS セレクタで 0ms 即時切替に上書きされる。
            filter: splitShadow(transitioning()),
            "will-change": transitioning() ? "transform, opacity" : "auto",
          }}
        >
          {/* AM 側を描画する条件:
                - merged 中 (transitioning 以外) は隠す → AM/PM split は表示しない
                - 自由回転 manual のドラッグ中は反対側 (= !isAm) を隠して合成負荷軽減
              ClockFace / ScheduleLayer / HandsLayer 全部にこの条件を適用する。 */}
          <Show when={(!mergedVisible() || transitioning()) && (isAm() || !dragging())}>
            <DimOverlay opacity={amDimOpacity()}>
              <ClockFace period="am" hours={amTime().hours} />
            </DimOverlay>
            {/* 予定アイコンは dim 階層の外。merge transition 中は外す (620ms の窓) */}
            <Show when={!transitioning()}>
              <ScheduleLayer
                period="am"
                dimmed={!isAm()}
                mergedHidden={mergedVisible()}
                displayedMinutes={displayedMinutesTotal()}
              />
            </Show>
            {/* 針は予定アイコンの上に乗せる (DOM order が後ろ = z 上) */}
            <DimOverlay opacity={amDimOpacity()}>
              <HandsLayer hours={amTime().hours} minutes={amTime().minutes} />
            </DimOverlay>
          </Show>
        </div>

        {/* PM */}
        <div
          ref={pmWrapperRef}
          class={
            "clock-wrapper-transition relative flex-1 flex flex-col items-center justify-center min-h-0 min-w-0 " +
            (isLandscape() ? "-ml-3" : "-mt-3")
          }
          classList={{ "opacity-instant": previewFlipped() }}
          style={{
            transform: pmTransform(mergedVisible(), isLandscape()),
            // AM と対称。wrapper 自身の opacity は外し、ClockFace/HandsLayer は内側 dim div で薄く、
            // ScheduleLayer は外で event ごとに制御する (= window 内 event は薄い側でもハッキリ)。
            filter: splitShadow(transitioning()),
            "will-change": transitioning() ? "transform, opacity" : "auto",
          }}
        >
          {/* PM 側 (AM 側と対称) */}
          <Show when={(!mergedVisible() || transitioning()) && (!isAm() || !dragging())}>
            <DimOverlay opacity={pmDimOpacity()}>
              <ClockFace period="pm" hours={pmTime().hours} />
            </DimOverlay>
            <Show when={!transitioning()}>
              <ScheduleLayer
                period="pm"
                dimmed={isAm()}
                mergedHidden={mergedVisible()}
                displayedMinutes={displayedMinutesTotal()}
              />
            </Show>
            <DimOverlay opacity={pmDimOpacity()}>
              <HandsLayer hours={pmTime().hours} minutes={pmTime().minutes} />
            </DimOverlay>
          </Show>
        </div>
      </div>

      {/* かさねモード: 中央に1つの時計 (absolute レイヤ、ポインタ不干渉)
          rotateActive のトグル時も opacity/transform で滑らかに消えるよう、
          見えうる間 (mergedVisible || transitioning) は DOM に保持する。 */}
      <Show when={mergedVisible() || transitioning()}>
        <div
          class={
            "clock-merged-container-transition absolute inset-0 flex items-center justify-center pointer-events-none " +
            (isLandscape() ? "flex-row" : "flex-col")
          }
          style={{
            // transition は .clock-merged-container-transition class 経由 (reduce-motion 対応のため)。
            opacity: mergedVisible() ? 1 : 0,
            transform: mergedTransform(mergedVisible()),
            "transform-origin": "center",
            filter: splitShadow(transitioning()),
            "will-change": transitioning() ? "transform, opacity" : "auto",
          }}
        >
          <div
            class={
              "relative flex items-center justify-center " +
              (isLandscape() ? "w-1/2 h-full" : "w-full h-1/2")
            }
          >
            <ClockFace period="merged" hours={displayed().hours} />
            {/* 重ね表示中: AM/PM 両方のレイヤーをこの盤面に投影。
                現在の period (displayed().hours < 12) を上 + 不透明、もう片方は強めに薄く後ろ。
                後ろレイヤーは dimmed + dimOpacity={0.15} で event-level に薄くするので、
                window 内の予定 (= もうすぐ起きる予定) はハッキリ見える。
                前後関係は document order で決める (back を先, front を後)。z-index は使わない:
                正の z-index を当てると、z-auto の HandsLayer を覆ってしまう。
                merge transition 中は AM/PM 二重描画 + 合成負荷を避けるため一時的に外す。 */}
            <Show when={!transitioning()}>
              <Show
                when={displayed().hours < 12}
                fallback={<>
                  <ScheduleLayer period="am" dimmed dimOpacity={0.15} scale={0.85}
                    displayedMinutes={displayedMinutesTotal()} />
                  <ScheduleLayer period="pm"
                    displayedMinutes={displayedMinutesTotal()} />
                </>}
              >
                <ScheduleLayer period="pm" dimmed dimOpacity={0.15} scale={0.85}
                  displayedMinutes={displayedMinutesTotal()} />
                <ScheduleLayer period="am"
                  displayedMinutes={displayedMinutesTotal()} />
              </Show>
            </Show>
            {/* 針は document order が最後 → z-auto の中で最前面 → 予定アイコンの上に乗る */}
            <HandsLayer hours={displayed().hours} minutes={displayed().minutes} />
          </div>
        </div>
      </Show>

      {/* 秒バー (通常モードのみ) */}
      <Show when={!rotateActive()}>
        <div class="absolute top-0 left-0 right-0 z-10 pointer-events-none">
          <SecondsBar seconds={displayed().seconds} hours={displayed().hours} />
        </div>
      </Show>

      {/* AM/PM バッジ + 長押しプレビュー (通常モードのみ)
          自由回転 manual の予定ボタン (将来追加) と MORPHING_SLOT.LEFT を共有し、
          モード遷移時にブラウザがモーフィング描画する。
          (slot 共有関係の一覧は features/view-transition.ts を参照) */}
      <Show when={!rotateActive()}>
        <div
          class={
            "absolute z-20 px-2.5 py-1 tablet:px-6 tablet:py-4 rounded-full text-base tablet:text-xl font-black shadow-md cursor-pointer " +
            (isLandscape()
              ? "left-1/2 top-2 -translate-x-1/2"
              : "left-2 top-1/2 -translate-y-1/2")
          }
          style={{
            "background-color": isAm() ? "#0080D8" : "#E02068",
            color: "#ffffff",
            "touch-action": "none",
            "view-transition-name": MORPHING_SLOT.LEFT,
          }}
          onPointerDown={startHold}
          onPointerUp={clearHold}
          onPointerLeave={clearHold}
          onPointerCancel={clearHold}
        >
          {isAm() ? t("badge.am") : t("badge.pm")}
        </div>
      </Show>

      <SettingsPanel />

      {/* 予定モード: リングメニュー (open 時のみマウント) */}
      <SchedulePicker />
    </div>
  );
};
