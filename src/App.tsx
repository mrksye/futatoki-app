import { createEffect, onCleanup, type Component } from "solid-js";
import { ClockLayout } from "./components/ClockLayout";
import { pickerOpen } from "./features/schedule/picker";
import { requestChronostasis } from "./lib/chronostasis";
import { useChronostasisBodyClass } from "./lib/chronostasis/solid";
import { I18nProvider } from "./i18n";

const App: Component = () => {
  // ピッカー open 中は chronostasis に入れて時計画面の動的副作用を全停止 →
  // backdrop-filter: blur が下層 cache を効かせて低スペック端末でも実用負荷で動く。
  useChronostasisBodyClass();
  createEffect(() => {
    if (!pickerOpen()) return;
    const release = requestChronostasis();
    onCleanup(release);
  });
  return (
    <I18nProvider>
      <ClockLayout />
    </I18nProvider>
  );
};

export default App;
