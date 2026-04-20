import type { Component } from "solid-js";
import { SettingsProvider } from "./store/settings";
import { ClockLayout } from "./components/ClockLayout";
import { I18nProvider } from "./i18n";

const App: Component = () => {
  return (
    <I18nProvider>
      <SettingsProvider>
        <ClockLayout />
      </SettingsProvider>
    </I18nProvider>
  );
};

export default App;
