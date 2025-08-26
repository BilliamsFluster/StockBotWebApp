export type SettingsState = {
  appearance: {
    mode: "system" | "light" | "dark";
    trueBlack: boolean;
    accent: "indigo" | "violet" | "blue" | "cyan" | "emerald";
    density: "cozy" | "compact";
    animations: boolean;
  };
  privacy: {
    privacyMode: boolean;
    redactAccountIds: boolean;
    redactOrderIds: boolean;
    telemetry: boolean;
  };
  info: {
    env: "Paper" | "Live" | "Sandbox";
    language: "English" | "Español" | "Deutsch";
    currency: "USD" | "EUR" | "JPY";
    notes: string;
  };
};

export const DEFAULTS: SettingsState = {
  appearance: {
    mode: "dark",
    trueBlack: true,
    accent: "violet",
    density: "cozy",
    animations: true,
  },
  privacy: {
    privacyMode: false,
    redactAccountIds: true,
    redactOrderIds: true,
    telemetry: false,
  },
  info: {
    env: "Paper",
    language: "English",
    currency: "USD",
    notes: "",
  },
};

export const ACCENT_OPTIONS = [
  { value: "violet", label: "Violet" },
  { value: "indigo", label: "Indigo" },
  { value: "blue", label: "Blue" },
  { value: "cyan", label: "Cyan" },
  { value: "emerald", label: "Emerald" },
] as const;

export const APP = {
  version: "1.7.0",
  buildId: "2025.08.13-rc2",
  commit: "c1e9a42",
  buildDate: "2025-08-13",
};

export const RELEASE_NOTES = [
  { version: "1.6.3", date: "2025-08-05", items: ["Add DOM ladder widget", "Portfolio filters & export", "Improve blotter performance"] },
  { version: "1.6.0", date: "2025-07-28", items: ["Initial StockBot runs tab", "Backtest report export", "Risk panel (VaR/ES)"] },
];
