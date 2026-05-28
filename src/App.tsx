import { createEffect, onCleanup, Show, type Component } from "solid-js";
import { ClockLayout } from "./components/ClockLayout";
import FirstLaunchSplash from "./components/FirstLaunchSplash";
import { pickerOpen } from "./features/activity/picker";
import { languagePickerOpen } from "./features/language-picker/state";
import { initFullMoonEasterEgg } from "./features/full-moon-easter-egg";
import { firstLaunchActive } from "./features/first-launch";
import { useTimerWatcher } from "./features/timer/timer-watcher";
import TimerStartToast from "./features/timer/TimerStartToast";
import { requestChronostasis } from "./lib/chronostasis";
import { useChronostasisBodyClass } from "./lib/chronostasis/solid";
import { I18nProvider } from "./i18n";

/** ピッカー open 中は chronostasis を発動させて時計画面の動的副作用を全停止する。
 *  backdrop-filter: blur が下層 cache を効かせて低スペック端末でも実用負荷で動く。
 *  activity / language どちらの picker でも同じ扱い。 */
const usePickerHoldsChronostasis = () => {
  createEffect(() => {
    if (!pickerOpen() && !languagePickerOpen()) return;
    const release = requestChronostasis();
    onCleanup(release);
  });
};

/** I18nProvider の内側で動かす必要があるもの (useI18n に依存する関心事) をまとめる shell。timer-watcher の
 *  MediaSession タイトルが localized 文字列を必要とするためここに置く。 */
const AppShell: Component = () => {
  useTimerWatcher();
  return (
    <>
      <ClockLayout />
      <Show when={firstLaunchActive()}>
        <FirstLaunchSplash />
      </Show>
      <TimerStartToast />
    </>
  );
};

const App: Component = () => {
  useChronostasisBodyClass();
  usePickerHoldsChronostasis();
  initFullMoonEasterEgg();
  return (
    <I18nProvider>
      <AppShell />
    </I18nProvider>
  );
};

export default App;
