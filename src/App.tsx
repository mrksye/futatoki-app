import { createEffect, onCleanup, type Component } from "solid-js";
import { ClockLayout } from "./components/ClockLayout";
import { pickerOpen } from "./features/schedule/picker";
import { initFullMoonEasterEgg } from "./features/full-moon-easter-egg";
import { requestChronostasis } from "./lib/chronostasis";
import { useChronostasisBodyClass } from "./lib/chronostasis/solid";
import { I18nProvider } from "./i18n";

/** ピッカー open 中は chronostasis を発動させて時計画面の動的副作用を全停止する。
 *  backdrop-filter: blur が下層 cache を効かせて低スペック端末でも実用負荷で動く。 */
const usePickerHoldsChronostasis = () => {
  createEffect(() => {
    if (!pickerOpen()) return;
    const release = requestChronostasis();
    onCleanup(release);
  });
};

const App: Component = () => {
  useChronostasisBodyClass();
  usePickerHoldsChronostasis();
  initFullMoonEasterEgg();
  return (
    <I18nProvider>
      <ClockLayout />
    </I18nProvider>
  );
};

export default App;
