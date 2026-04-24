import type { Component } from "solid-js";
import { ClockLayout } from "./components/ClockLayout";
import { I18nProvider } from "./i18n";

const App: Component = () => {
  return (
    <I18nProvider>
      <ClockLayout />
    </I18nProvider>
  );
};

export default App;
