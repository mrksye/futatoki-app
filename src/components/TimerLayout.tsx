import { createEffect, createMemo, createSignal, onCleanup, Show, type Component } from "solid-js";
import ClockFace from "./clockface-layers/ClockFace";
import HandsLayer from "./clockface-layers/HandsLayer";
import TimerWedge from "../features/timer/TimerWedge";
import { useOrientation } from "../hooks/useOrientation";
import { useViewport } from "../hooks/useViewport";
import { useI18n } from "../i18n";
import {
  timerPhase,
  selectedMinutes,
  runStartMs,
  pausedRemainingMs,
  completeTimer,
} from "../features/timer/state";
import { timerAlarm } from "../features/timer/timer-alarm";

/**
 * 分タイマーモードの表示レイヤー。clock / 回転モードの表示ツリー (ClockLayout) とは排他で、回転
 * machinery (drag / wheel / merge animation / AM/PM selection dim) を一切持たない独立コンポーネント。
 * 合体時計 (ClockFace period="merged") とその針 (HandsLayer) を視覚流用するだけで状態は共有しない。
 * 操作 (せっと / すたーと / とりけし / リングメニュー) は TimerActions が担当し、本ファイルは
 * timer/state の signal を読んで「見せる」だけ。
 *
 * 両盤面の時刻はモード入室から 250ms ごとに live で進み続ける。setup 中 (unset / picking) も止めない。
 * リングで分を選ぶと即 running に入り、開始時刻 (runStartMs) 基準の固定マーカーへ向けて現在針が進む。
 * 現在針がマーカーに重なった (終了時刻に到達した) ところで clamp して止まる = 鳴り終わりに現在針が
 * 終了マーカーちょうどに重なる。
 *
 * 盤面の役割:
 *  - AM 位置 (landscape 左 / portrait 上): 現在時刻の合体時計 (通常の黒針)。
 *  - PM 位置 (landscape 右 / portrait 下): タイマー盤。グレーの現在針 (長針 ghost) + 黒い終了マーカー針
 *    (markerMinutes, タイマーの目標)。終了マーカーは分を選んだ瞬間 (= 即 running) から出て固定。
 *    現在針がそこへ近づき、重なったら終了。短針 (時針) はマーカーを出さない (分タイマーなので無視)。
 */

/** PM 位置のグレー現在針 (長針 ghost) の黒本体の不透明度。黒い終了マーカー (不透明) との対比で薄く見せる。 */
const NOW_HAND_OPACITY = 0.2;

/** 完了時のバイブパターン (対応端末のみ。iOS Safari は Vibration API 非対応なので実質 Android 向け)。 */
const ALARM_VIBRATE_PATTERN = [200, 100, 200];

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

  const hasSelection = () =>
    timerPhase() === "running" || timerPhase() === "paused" || timerPhase() === "done";

  /** カウントダウン終了時刻 (ms)。
   *  - running / done: 開始押下時刻 (runStartMs) 基準で固定 (done は nowMs を完了時刻に clamp 済みなので
   *    現在針と重なる)。
   *  - paused: 現在時刻 + 凍結した残り → 時計が進むとマーカーも一緒に動き、扇 (残り) の幅は一定に保つ。
   *  - unset / picking (sel=null): null。 */
  const endMs = (): number | null => {
    const sel = selectedMinutes();
    if (sel === null) return null;
    if (timerPhase() === "running" || timerPhase() === "done") {
      const start = runStartMs();
      return start === null ? null : start + sel * 60000;
    }
    if (timerPhase() === "paused") {
      const rem = pausedRemainingMs();
      return rem === null ? null : nowMs() + rem;
    }
    return null;
  };

  /** 終了マーカー針の位置 (分, 小数)。選択済み (running / paused / done) のときだけ値を返す。 */
  const markerMinutes = (): number | undefined => {
    if (!hasSelection()) return undefined;
    const e = endMs();
    if (e === null) return undefined;
    const d = new Date(e);
    return d.getMinutes() + d.getSeconds() / 60;
  };

  /** 残り秒。running=実時間で減る / paused=凍結した残り / done=0。 */
  const remainingSeconds = (): number | null => {
    const sel = selectedMinutes();
    if (sel === null) return null;
    if (timerPhase() === "done") return 0;
    if (timerPhase() === "paused") {
      const rem = pausedRemainingMs();
      return rem === null ? null : Math.ceil(rem / 1000);
    }
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

  // timer モード中は requestAnimationFrame で現在時刻を取り直し、両盤面の針を live で進める (paused でも
  // 時計は実時刻のまま進み、扇=残りだけ凍結)。setInterval ではなく rAF なのは、背景タブでは自動的に止まり
  // 計時を無駄に進めないため。計時の真実は endMs - Date.now() のままで、rAF は表示専用 (値の積算はしない)。
  // running 中に終了時刻へ達したら現在時刻を完了時刻に clamp し、done へ遷移してアラームを鳴らす
  // (フォアグラウンド発火経路)。背景での発火と復帰時の取りこぼし回収は timer-alarm 側の予約発火 /
  // visibilitychange 照合が担当する。done は完了時刻で盤面を凍結するので tick しない。
  createEffect(() => {
    const phase = timerPhase();
    if (phase === "done") {
      const e = endMs();
      if (e !== null) setNowMs(e);
      return;
    }
    let animationFrameId = 0;
    const tick = () => {
      const now = Date.now();
      if (phase === "running") {
        const e = endMs();
        if (e !== null && now >= e) {
          setNowMs(e);
          completeTimer();
          timerAlarm()?.ensureAlarmPlaying();
          if (typeof navigator.vibrate === "function") navigator.vibrate(ALARM_VIBRATE_PATTERN);
          return;
        }
      }
      setNowMs(now);
      animationFrameId = requestAnimationFrame(tick);
    };
    animationFrameId = requestAnimationFrame(tick);
    onCleanup(() => cancelAnimationFrame(animationFrameId));
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
      {/* 集中向けの静的背景 (中央に光だまり)。盤面の後ろに敷く decorative レイヤー。 */}
      <div class="timer-background absolute inset-0 pointer-events-none" />
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

        {/* PM 位置: タイマー盤。グレーの現在針 (ghost) + 黒い終了マーカー針 + その間を塗るタイマー扇。
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
              minuteHandOpacity={NOW_HAND_OPACITY}
              markerMinutes={markerMinutes()}
            />
          </div>
        </div>
      </div>

      {/* デジタル残り時間。AM/PM バッジと同じスロット位置 (portrait 中央左 / landscape 中央上)。
          running / paused / done のとき出す。情報表示なのでタップは透過 (pointer-events-none)。 */}
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
