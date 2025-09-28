import type { DockviewLayout, DockviewNode, DockviewGroupNode } from "dockview";

export const TRAINING_LAYOUT_STORAGE_KEY = "stockbot:trainingResults:docklayout:v2";

export const panelDefinitions = {
  overview: { id: "panel-overview", title: "Overview", component: "overview" },
  performance: { id: "panel-performance", title: "Performance", component: "performance" },
  trades: { id: "panel-trades", title: "Trades & Behavior", component: "trades" },
  risk: { id: "panel-risk", title: "Risk & Exposure", component: "risk" },
  diagnostics: { id: "panel-diagnostics", title: "Advanced Diagnostics", component: "diagnostics" },
  scalars: { id: "panel-scalars", title: "Raw Scalars", component: "scalars" },
  monitor: { id: "panel-monitor", title: "Monitor", component: "monitor" },
} as const;

const createPanel = <K extends keyof typeof panelDefinitions>(key: K) => ({
  ...panelDefinitions[key],
});

const group = (config: Omit<DockviewGroupNode, "type">): DockviewGroupNode => ({
  type: "group",
  ...config,
});

const horizontalLayout = (id: string, children: DockviewGroupNode[]): DockviewLayout => {
  if (children.length === 0) {
    return { version: "2", root: null };
  }
  if (children.length === 1) {
    return { version: "2", root: children[0] };
  }
  return {
    version: "2",
    root: {
      type: "split",
      id,
      orientation: "horizontal",
      children,
    },
  };
};

export const defaultDockLayout: DockviewLayout = horizontalLayout("split-default", [
  group({
    id: "group-overview",
    size: 1.2,
    active: panelDefinitions.overview.id,
    tabs: [createPanel("overview"), createPanel("performance")],
  }),
  group({
    id: "group-behavior",
    size: 1.1,
    active: panelDefinitions.trades.id,
    tabs: [createPanel("trades"), createPanel("risk"), createPanel("diagnostics")],
  }),
  group({
    id: "group-data",
    size: 1,
    active: panelDefinitions.scalars.id,
    tabs: [createPanel("scalars")],
  }),
  group({
    id: "group-monitor",
    size: 1.2,
    active: panelDefinitions.monitor.id,
    tabs: [createPanel("monitor")],
  }),
]);

export const analysisDockLayout: DockviewLayout = horizontalLayout("split-analysis", [
  group({
    id: "group-core",
    size: 1.6,
    active: panelDefinitions.performance.id,
    tabs: [
      createPanel("overview"),
      createPanel("performance"),
      createPanel("diagnostics"),
      createPanel("risk"),
    ],
  }),
  group({
    id: "group-context",
    size: 1.2,
    active: panelDefinitions.scalars.id,
    tabs: [createPanel("scalars"), createPanel("trades")],
  }),
  group({
    id: "group-monitor-analysis",
    size: 1,
    active: panelDefinitions.monitor.id,
    tabs: [createPanel("monitor")],
  }),
]);

export const compactDockLayout: DockviewLayout = horizontalLayout("split-compact", [
  group({
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
    ],
  }),
  group({
    id: "group-monitor-compact",
    size: 1,
    active: panelDefinitions.monitor.id,
    tabs: [createPanel("monitor")],
  }),
]);

export const DOCK_PRESETS: Array<{ id: string; label: string; layout: DockviewLayout }> = [
  { id: "default", label: "Default Columns", layout: defaultDockLayout },
  { id: "analysis", label: "Analysis Focus", layout: analysisDockLayout },
  { id: "compact", label: "Compact Stack", layout: compactDockLayout },
];

export type PanelKey = keyof typeof panelDefinitions;

const cloneNode = (node: DockviewNode): DockviewNode => {
  if (node.type === "group") {
    return {
      ...node,
      tabs: node.tabs.map((tab) => ({ ...tab })),
    };
  }
  return {
    ...node,
    children: node.children.map(cloneNode),
  };
};

const hasRoot = (layout: unknown): layout is DockviewLayout =>
  Boolean(layout && typeof layout === "object" && "root" in layout);

const convertLegacy = (value: { groups?: any[] } | undefined): DockviewLayout => {
  const groups = Array.isArray(value?.groups) ? value!.groups : [];
  const nodes = groups
    .map((legacy, index) => {
      const rawTabs = Array.isArray(legacy?.tabs) ? legacy.tabs : [];
      const tabs = rawTabs
        .filter((tab: any) => tab && typeof tab.component === "string")
        .map((tab: any, tabIndex: number) => ({
          id:
            typeof tab.id === "string"
              ? tab.id
              : `${tab.component}-${index}-${tabIndex}`,
          component: tab.component,
          title: typeof tab.title === "string" ? tab.title : tab.component,
          params: tab.params,
        }));
      if (tabs.length === 0) return null;
      const activeId =
        typeof legacy?.active === "string" && tabs.some((tab) => tab.id === legacy.active)
          ? legacy.active
          : tabs[0].id;
      return group({
        id: typeof legacy?.id === "string" ? legacy.id : `group-${index}`,
        size: typeof legacy?.size === "number" ? legacy.size : undefined,
        active: activeId,
        tabs,
      });
    })
    .filter((node): node is DockviewGroupNode => node !== null);
  return horizontalLayout("split-legacy", nodes);
};

export const cloneDockLayout = (layout: DockviewLayout | { groups?: any[] }): DockviewLayout => {
  if (hasRoot(layout)) {
    return {
      version: "2",
      root: layout.root ? cloneNode(layout.root) : null,
    };
  }
  return convertLegacy(layout);
};

const collectPanels = (node: DockviewNode | null, acc: string[]) => {
  if (!node) return;
  if (node.type === "group") {
    node.tabs.forEach((tab) => acc.push(tab.id));
    return;
  }
  node.children.forEach((child) => collectPanels(child, acc));
};

export const extractPanelIds = (layout: DockviewLayout | { groups?: any[] }): string[] => {
  const panels: string[] = [];
  const source = hasRoot(layout) ? layout.root : convertLegacy(layout).root;
  collectPanels(source ?? null, panels);
  return panels;
};

const collectActivePanels = (node: DockviewNode | null, acc: string[]) => {
  if (!node) return;
  if (node.type === "group") {
    const activeId =
      typeof node.active === "string" && node.tabs.some((tab) => tab.id === node.active)
        ? node.active
        : node.tabs[0]?.id;
    if (activeId) acc.push(activeId);
    return;
  }
  node.children.forEach((child) => collectActivePanels(child, acc));
};

export const extractActivePanelIds = (layout: DockviewLayout | { groups?: any[] }): string[] => {
  const panels: string[] = [];
  const source = hasRoot(layout) ? layout.root : convertLegacy(layout).root;
  collectActivePanels(source ?? null, panels);
  return panels;
};
