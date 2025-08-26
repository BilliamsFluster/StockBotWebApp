"use client";

import * as React from "react";
import { DEFAULTS, SettingsState } from "../lib/config";

export function useSettings() {
  const [state, setState] = React.useState<SettingsState>(() => {
    try {
      const raw = localStorage.getItem("settings");
      return raw ? JSON.parse(raw) : DEFAULTS;
    } catch {
      return DEFAULTS;
    }
  });

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const root = document.documentElement;
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const handleSystemThemeChange = (e: MediaQueryListEvent) => {
      root.classList.toggle("dark", e.matches);
    };

    mediaQuery.removeEventListener("change", handleSystemThemeChange);

    if (state.appearance.mode === "system") {
      root.classList.toggle("dark", mediaQuery.matches);
      mediaQuery.addEventListener("change", handleSystemThemeChange);
    } else {
      root.classList.toggle("dark", state.appearance.mode === "dark");
    }

    root.dataset.trueBlack = String(state.appearance.trueBlack);
    root.dataset.accent = state.appearance.accent;
    root.dataset.density = state.appearance.density;
    root.dataset.anim = state.appearance.animations ? "on" : "off";
    root.dataset.privacy = state.privacy.privacyMode ? "on" : "off";

    localStorage.setItem("settings", JSON.stringify(state));

    return () => {
      mediaQuery.removeEventListener("change", handleSystemThemeChange);
    };
  }, [state]);

  return { state, setState } as const;
}
