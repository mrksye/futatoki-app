import { createEffect, createMemo, createSignal, onCleanup, Show, type Component } from "solid-js";
import ClockFace from "./ClockFace";
import HandsLayer from "./HandsLayer";
import TimerWedge from "../features/timer/TimerWedge";
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
 * 両盤面の時刻はモード入室から 250ms ごとに live で進み続ける。setup 中 (unset / picking / armed) も
 * 止めない。armed の黒い終了マーカーは「現在時刻 + 選択分」を live で追うので、現在針との間隔は選択
 * 分のぶんで一定に保たれる (時計が進んでもプレビューの残り時間がズレない)。running に入ると開始時刻
 * (runStartMs) 基準の固定マーカーへ切り替わり、現在針がそこへ近づいて重なった (終了時刻に到達した)
 * ところで clamp して止まる = 鳴り終わりに現在針が終了マーカーちょうどに重なる。
 *
 * 盤面の役割:
 *  - AM 位置 (landscape 左 / portrait 上): 現在時刻の合体時計 (通常の黒針)。
 *  - PM 位置 (landscape 右 / portrait 下): タイマー盤。黒い現在針 (長針) + グレーの終了マーカー針
 *    (markerMinutes, タイマーの目標 ghost)。終了マーカーは分を選んだ瞬間 (armed) から出て、running 中
 *    は固定。現在針がそこへ近づき、重なったら終了。短針 (時針) はマーカーを出さない (分タイマーなので無視)。
 */

/** PM 位置の終了マーカー針 (タイマーの目標, 長針 ghost) の不透明度。黒い現在針 (不透明) との対比で
 *  薄く見せる。 */
const TARGET_MARKER_OPACITY = 0.2;

const TimerLayout: Component = () => {
  const isLandscape = useOrientation();
  const viewport = useViewport();
  const { formatNumeral } = useI18n();

  // timer モード中ずっと 250ms ごとに更新する現在時刻。両盤面の針はこれを基準に live で進む。
  const [nowMs, setNowMs] = createSignal(Date.now());

  const refDate = createMemo(() => new Date(nowMs()));
  const refHours = () => refDate().getHours();
  /** 秒も混ぜた分 (小数) → running 中の現在針がカクつかず滑らかに進む。 */
  const refMinuteFloat = () => refDate().getMinutes() + refDate().getSeconds() / 60;

  const hasSelection = () => timerPhase() === "armed" || timerPhase() === "running";

  /** カウントダウン終了時刻 (ms)。armed は現在時刻 live 基準のプレビュー (時計と一緒に前へ滑り、現在針
   *  との間隔は選択分のまま一定)、running は開始押下時刻 (runStartMs) 基準で固定。未選択なら null。 */
  const endMs = (): number | null => {
    const sel = selectedMinutes();
    if (sel === null) return null;
    if (timerPhase() === "running") {
      const start = runStartMs();
      return start === null ? null : start + sel * 60000;
    }
    return nowMs() + sel * 60000;
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

  // timer モード中ずっと 250ms ごとに現在時刻を取り直し、両盤面の針を live で進める。phase を読んで
  // 遷移ごとに interval を張り直す (running 終了で止めた後に とりけし で復帰させるため)。running 中は
  // 終了時刻に達したら clamp して interval を止め、現在針を終了マーカーちょうどに止める (= 鳴り終わり)。
  createEffect(() => {
    const phase = timerPhase();
    setNowMs(Date.now());
    const id = setInterval(() => {
      const now = Date.now();
      if (phase === "running") {
        const e = endMs();
        if (e !== null && now >= e) {
          setNowMs(e);
          clearInterval(id);
          return;
        }
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

        {/* PM 位置: タイマー盤。黒い現在針 + グレーの終了マーカー針 + その間を塗るタイマー扇。
            扇は ClockFace の children = ベースと数字の間に入り、現在針から残り時間ぶん塗る。 */}
        <div
          class="relative flex-1 flex flex-col items-center justify-center min-h-0 min-w-0"
          classList={{ "-ml-3": isLandscape(), "-mt-3": !isLandscape() }}
        >
          <div class="relative" style={{ width: `${clockSize()}px`, height: `${clockSize()}px` }}>
            <ClockFace period="merged" hours={refHours()}>
              <TimerWedge fromMinute={refMinuteFloat()} spanMinutes={(remainingSeconds() ?? 0) / 60} />
            </ClockFace>
            <HandsLayer
              hours={refHours()}
              minutes={refMinuteFloat()}
              markerMinutes={markerMinutes()}
              markerHandOpacity={TARGET_MARKER_OPACITY}
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
