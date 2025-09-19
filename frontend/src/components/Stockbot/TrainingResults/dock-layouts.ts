import type { DockviewLayout } from "dockview";

export const TRAINING_LAYOUT_STORAGE_KEY = "stockbot:trainingResults:docklayout:v1";

export const panelDefinitions = {
  overview: { id: "panel-overview", title: "Overview", component: "overview" },
  performance: { id: "panel-performance", title: "Performance", component: "performance" },
  trades: { id: "panel-trades", title: "Trades & Behavior", component: "trades" },
  risk: { id: "panel-risk", title: "Risk & Exposure", component: "risk" },
  diagnostics: { id: "panel-diagnostics", title: "Diagnostics", component: "diagnostics" },
  scalars: { id: "panel-scalars", title: "Data & Scalars", component: "scalars" },
  artifacts: { id: "panel-artifacts", title: "Artifacts", component: "artifacts" },
  monitor: { id: "panel-monitor", title: "Monitor", component: "monitor" },
} as const;

const createPanel = <K extends keyof typeof panelDefinitions>(key: K) => ({
  ...panelDefinitions[key],
});

export const defaultDockLayout: DockviewLayout = {
  groups: [
    {
      id: "group-overview",
      size: 1.2,
      active: panelDefinitions.overview.id,
      tabs: [createPanel("overview"), createPanel("performance")],
    },
    {
      id: "group-behavior",
      size: 1.1,
      active: panelDefinitions.trades.id,
      tabs: [createPanel("trades"), createPanel("risk"), createPanel("diagnostics")],
    },
    {
      id: "group-data",
      size: 1,
      active: panelDefinitions.scalars.id,
      tabs: [createPanel("scalars"), createPanel("artifacts")],
    },
    {
      id: "group-monitor",
      size: 1.2,
      active: panelDefinitions.monitor.id,
      tabs: [createPanel("monitor")],
    },
  ],
};

export const analysisDockLayout: DockviewLayout = {
  groups: [
    {
      id: "group-core",
      size: 1.6,
      active: panelDefinitions.performance.id,
      tabs: [
        createPanel("overview"),
        createPanel("performance"),
        createPanel("diagnostics"),
        createPanel("risk"),
      ],
    },
    {
      id: "group-context",
      size: 1.2,
      active: panelDefinitions.scalars.id,
      tabs: [createPanel("scalars"), createPanel("trades"), createPanel("artifacts")],
    },
    {
      id: "group-monitor-analysis",
      size: 1,
      active: panelDefinitions.monitor.id,
      tabs: [createPanel("monitor")],
    },
  ],
};

export const compactDockLayout: DockviewLayout = {
  groups: [
    {
      id: "group-all",
      size: 1.8,
      active: panelDefinitions.overview.id,
      tabs: [
        createPanel("overview"),
        createPanel("performance"),
        createPanel("trades"),
        createPanel("risk"),
        createPanel("diagnostics"),
        createPanel("scalars"),
        createPanel("artifacts"),
      ],
    },
    {
      id: "group-monitor-compact",
      size: 1,
      active: panelDefinitions.monitor.id,
      tabs: [createPanel("monitor")],
    },
  ],
};

export const DOCK_PRESETS: Array<{ id: string; label: string; layout: DockviewLayout }> = [
  { id: "default", label: "Default Columns", layout: defaultDockLayout },
  { id: "analysis", label: "Analysis Focus", layout: analysisDockLayout },
  { id: "compact", label: "Compact Stack", layout: compactDockLayout },
];

export type PanelKey = keyof typeof panelDefinitions;

export const cloneDockLayout = (layout: DockviewLayout): DockviewLayout => ({
  groups: layout.groups.map((group) => ({
    ...group,
    tabs: group.tabs.map((tab) => ({ ...tab })),
  })),
});

export const extractPanelIds = (layout: DockviewLayout): string[] =>
  layout.groups.flatMap((group) => group.tabs.map((tab) => tab.id));
