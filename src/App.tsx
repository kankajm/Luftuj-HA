import {
  MantineProvider,
  createTheme,
  localStorageColorSchemeManager,
  useMantineColorScheme,
} from "@mantine/core";
import { Notifications } from "@mantine/notifications";
import { RouterProvider } from "@tanstack/react-router";
import { I18nextProvider } from "react-i18next";
import { Suspense, useEffect } from "react";

import { router } from "./router";
import i18n, { getInitialLanguage, isSupportedLanguage, setLanguage } from "./i18n";

const theme = createTheme({
  primaryColor: "blue",
  colors: {
    blue: [
      "#e7f5ff",
      "#d0ebff",
      "#a5d8ff",
      "#74c0fc",
      "#4dabf7",
      "#339af0",
      "#228be6",
      "#1c7ed6",
      "#1971c2",
      "#1864ab",
    ],
  },
});

const colorSchemeManager = localStorageColorSchemeManager({ key: "luftujha-color-scheme" });

function ThemeInitializer() {
  const { setColorScheme } = useMantineColorScheme();

  useEffect(() => {
    let active = true;

    async function synchroniseTheme() {
      try {
        const response = await fetch("/api/settings/theme");
        if (!response.ok) {
          return;
        }
        const data = (await response.json()) as { theme?: string };
        if (!active) {
          return;
        }
        if (data.theme === "dark" || data.theme === "light") {
          setColorScheme(data.theme);
        }
      } catch (error) {
        console.error("Failed to load persisted theme", error);
      }
    }

    void synchroniseTheme();

    return () => {
      active = false;
    };
  }, [setColorScheme]);

  return null;
}

function LanguageInitializer() {
  useEffect(() => {
    let active = true;

    async function initialiseLanguage() {
      try {
        await setLanguage(getInitialLanguage());

        const response = await fetch("/api/settings/language");
        if (!response?.ok) {
          return;
        }
        const data = (await response.json()) as { language?: string };
        if (!active) {
          return;
        }
        if (data.language && isSupportedLanguage(data.language)) {
          await setLanguage(data.language);
        }
      } catch (error) {
        console.error("Failed to synchronise language preference", error);
      }
    }

    void initialiseLanguage();

    return () => {
      active = false;
    };
  }, []);

  return null;
}

export default function App() {
  return (
    <I18nextProvider i18n={i18n} defaultNS="common">
      <MantineProvider
        theme={theme}
        withCssVariables
        colorSchemeManager={colorSchemeManager}
        defaultColorScheme="auto"
      >
        <LanguageInitializer />
        <ThemeInitializer />
        <Notifications position="bottom-right" limit={3} zIndex={4000} />
        <Suspense fallback={null}>
          <RouterProvider router={router} />
        </Suspense>
      </MantineProvider>
    </I18nextProvider>
  );
}
