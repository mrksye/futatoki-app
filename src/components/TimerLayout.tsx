import { createEffect, createMemo, createSignal, onCleanup, Show, type Component } from "solid-js";
import ClockFace from "./ClockFace";
import HandsLayer from "./HandsLayer";
import { useOrientation } from "../hooks/useOrientation";
import { useViewport } from "../hooks/useViewport";
import { useI18n } from "../i18n";
import {
  timerPhase,
  selectedMinutes,
  runStartMs,
} from "../features/timer/state";

/**
 * 分タイマーモードの表示レイヤー。clock / 回転モードの表示ツリー (ClockLayout) とは排他で、回転
 * machinery (drag / wheel / merge animation / AM/PM selection dim) を一切持たない独立コンポーネント。
 * 合体時計 (ClockFace period="merged") とその針 (HandsLayer) を視覚流用するだけで状態は共有しない。
 * 操作 (せっと / すたーと / とりけし / リングメニュー) は TimerActions が担当し、本ファイルは
 * timer/state の signal を読んで「見せる」だけ。
 *
 * 基準時刻 (entry) はモード入室時に 1 回だけ捕えて固定する。setup 中 (unset / picking / armed) は
 * この frozen 値で両盤面が止まり、タイマー設定中に時計が動く問題を断つ。running に入ると現在時刻を
 * 250ms ごとに取り直して (nowMs)、グレーの現在針がリアルタイムで進む。
 *
 * 盤面の役割:
 *  - AM 位置 (landscape 左 / portrait 上): 現在時刻の合体時計 (通常の黒針)。
 *  - PM 位置 (landscape 右 / portrait 下): タイマー盤。グレーの現在針 (長針, ghost) + 黒い終了
 *    マーカー針 (markerMinutes)。終了マーカーは分を選んだ瞬間 (armed) から出て、running 中は固定。
 *    現在針がそこへ近づき、重なったら終了。短針 (時針) は黒マーカーを出さない (分タイマーなので無視)。
 */

/** PM 位置のグレー現在針 (長針 ghost) の不透明度。黒い終了マーカー (不透明) との対比で薄く見せる。 */
const NOW_MINUTE_HAND_OPACITY = 0.2;

const TimerLayout: Component = () => {
  const isLandscape = useOrientation();
  const viewport = useViewport();
  const { formatNumeral } = useI18n();

  // モード入室時の現在時刻を 1 回だけ固定 (frozen reference)。setup 中の基準。
  const entryMs = Date.now();
  // running 中だけ 250ms ごとに更新する現在時刻。setup 中は参照されない。
  const [nowMs, setNowMs] = createSignal(entryMs);

  /** running 中は live、それ以外は entry に固定した基準時刻 (ms)。 */
  const refMs = () => (timerPhase() === "running" ? nowMs() : entryMs);
  const refDate = createMemo(() => new Date(refMs()));
  const refHours = () => refDate().getHours();
  /** 秒も混ぜた分 (小数) → running 中の現在針がカクつかず滑らかに進む。 */
  const refMinuteFloat = () => refDate().getMinutes() + refDate().getSeconds() / 60;

  const hasSelection = () => timerPhase() === "armed" || timerPhase() === "running";

  /** カウントダウン終了時刻 (ms)。armed は entry 基準のプレビュー、running は開始押下時刻 (runStartMs)
   *  基準。未選択なら null。 */
  const endMs = (): number | null => {
    const sel = selectedMinutes();
    if (sel === null) return null;
    if (timerPhase() === "running") {
      const start = runStartMs();
      return start === null ? null : start + sel * 60000;
    }
    return entryMs + sel * 60000;
  };

  /** 黒い終了マーカー針の位置 (分, 小数)。armed / running のときだけ値を返す。 */
  const markerMinutes = (): number | undefined => {
    if (!hasSelection()) return undefined;
    const e = endMs();
    if (e === null) return undefined;
    const d = new Date(e);
    return d.getMinutes() + d.getSeconds() / 60;
  };

  /** 残り秒。armed は選択分の満タン、running は実時間で減る。 */
  const remainingSeconds = (): number | null => {
    const sel = selectedMinutes();
    if (sel === null) return null;
    if (timerPhase() === "armed") return sel * 60;
    if (timerPhase() === "running") {
      const e = endMs();
      return e === null ? null : Math.max(0, Math.ceil((e - nowMs()) / 1000));
    }
    return null;
  };

  /** ロケール数字で 2 桁ゼロ埋め (formatNumeral は桁数を保たないので 1 桁は zero glyph を前置)。 */
  const pad2 = (v: number) => (v < 10 ? formatNumeral(0) + formatNumeral(v) : formatNumeral(v));
  const digital = (): string | null => {
    const r = remainingSeconds();
    if (r === null) return null;
    return `${pad2(Math.floor(r / 60))}:${pad2(r % 60)}`;
  };

  // running 中だけ現在時刻を取り直す。終了時刻に達したら clamp して interval を止める。
  createEffect(() => {
    if (timerPhase() !== "running") return;
    setNowMs(Date.now());
    const id = setInterval(() => {
      const now = Date.now();
      const e = endMs();
      if (e !== null && now >= e) {
        setNowMs(e);
        clearInterval(id);
        return;
      }
      setNowMs(now);
    }, 250);
    onCleanup(() => clearInterval(id));
  });

  /** 各半盤に置ける合体時計の natural 寸法 (min(halfW, halfH))。ClockLayout の isRotating 時と同じ
   *  計算で、floating palette ボタンの clearance は考慮しない (timer モードでは palette は popover 内)。 */
  const clockSize = createMemo(() => {
    const w = viewport.width();
    const h = viewport.height();
    const land = isLandscape();
    const halfW = land ? w / 2 : w;
    const halfH = land ? h : h / 2;
    return Math.min(halfW, halfH);
  });

  return (
    <>
      <div class={"absolute inset-0 flex items-stretch " + (isLandscape() ? "flex-row" : "flex-col")}>
        {/* AM 位置: 現在時刻の合体時計 (通常の黒針)。z-10 は ClockLayout の split と揃える。 */}
        <div
          class="relative z-10 flex-1 flex flex-col items-center justify-center min-h-0 min-w-0"
          classList={{ "-mr-3": isLandscape(), "-mb-3": !isLandscape() }}
        >
          <div class="relative" style={{ width: `${clockSize()}px`, height: `${clockSize()}px` }}>
            <ClockFace period="merged" hours={refHours()} />
            <HandsLayer hours={refHours()} minutes={refMinuteFloat()} />
          </div>
        </div>

        {/* PM 位置: タイマー盤。グレー現在針 (ghost) + 黒い終了マーカー針。 */}
        <div
          class="relative flex-1 flex flex-col items-center justify-center min-h-0 min-w-0"
          classList={{ "-ml-3": isLandscape(), "-mt-3": !isLandscape() }}
        >
          <div class="relative" style={{ width: `${clockSize()}px`, height: `${clockSize()}px` }}>
            <ClockFace period="merged" hours={refHours()} />
            <HandsLayer
              hours={refHours()}
              minutes={refMinuteFloat()}
              minuteHandOpacity={NOW_MINUTE_HAND_OPACITY}
              markerMinutes={markerMinutes()}
            />
          </div>
        </div>
      </div>

      {/* デジタル残り時間。AM/PM バッジと同じスロット位置 (portrait 中央左 / landscape 中央上)。
          armed / running のときだけ出す。情報表示なのでタップは透過 (pointer-events-none)。 */}
      <Show when={digital() !== null}>
        <div
          class={
            "absolute z-20 px-4 py-1.5 tablet:px-7 tablet:py-3 rounded-full shadow-md " +
            "bg-gray-900/85 text-white font-black text-2xl tablet:text-4xl select-none pointer-events-none " +
            (isLandscape()
              ? "left-1/2 top-[var(--safe-edge-top)] -translate-x-1/2"
              : "left-[var(--safe-edge-left)] top-1/2 -translate-y-1/2")
          }
          style={{ "font-variant-numeric": "tabular-nums" }}
        >
          {digital()}
        </div>
      </Show>
    </>
  );
};

export default TimerLayout;
