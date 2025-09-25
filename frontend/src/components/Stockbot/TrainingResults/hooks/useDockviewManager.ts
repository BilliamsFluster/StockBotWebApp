import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type {
  DockviewApi,
  DockviewLayout,
  DockviewTheme,
  DockviewEvent,
  GroupDragEvent,
  TabDragEvent,
  MovePanelEvent,
  DockviewGroupPanel,
  IDockviewPanel,
} from "dockview-core";
import type { DockviewReadyEvent } from "dockview/dist/esm/dockview/dockview";

import {
  DOCK_PRESETS,
  TRAINING_LAYOUT_STORAGE_KEY,
  cloneDockLayout,
  defaultDockLayout,
  extractActivePanelIds,
  extractPanelIds,
  panelDefinitions,
  type PanelKey,
} from "../dock-layouts";

export type DockviewManager = {
  dockReady: boolean;
  openPanels: string[];
  visiblePanels: string[];
  currentLayout: string;
  hasSavedLayout: boolean;
  dockviewRootDndEdges: { activationSize: { type: "percentage"; value: number }; size: { type: "pixels"; value: number } };
  dockviewTheme: DockviewTheme;
  handleDockReady: (event: DockviewReadyEvent) => void;
  handleLayoutChange: (layout: DockviewLayout) => void;
  handlePresetChange: (presetId: string) => void;
  handleSaveLayout: () => void;
  handleLoadSavedLayout: () => void;
  handleClearSavedLayout: () => void;
  handlePanelLaunch: (panelKey: PanelKey) => void;
  focusPanel: (panelId: string) => void;
  applyLayout: (layout: DockviewLayout | { groups?: any[] }, presetId: string) => boolean;
};

type DockviewDragAwareApi = DockviewApi & {
  onWillDragPanel?: DockviewEvent<TabDragEvent>;
  onWillDragGroup?: DockviewEvent<GroupDragEvent>;
  onDidMovePanel?: DockviewEvent<MovePanelEvent>;
  onDidAddGroup?: DockviewEvent<DockviewGroupPanel>;
  onDidRemoveGroup?: DockviewEvent<DockviewGroupPanel>;
  onDidLayoutChange?: DockviewEvent<void>;
  onDidActivePanelChange?: DockviewEvent<IDockviewPanel | undefined>;
};

export function useDockviewManager(): DockviewManager {
  const [openPanels, setOpenPanels] = useState<string[]>([]);
  const [visiblePanels, setVisiblePanels] = useState<string[]>([]);
  const [dockReady, setDockReady] = useState(false);
  const [currentLayout, setCurrentLayout] = useState("default");
  const [hasSavedLayout, setHasSavedLayout] = useState(false);

  const dockApiRef = useRef<DockviewApi | null>(null);
  const suppressLayoutChangeRef = useRef(false);
  const pendingLayoutChangeRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingOpenPanelsRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dockSubscriptionsRef = useRef<Array<{ dispose: () => void }>>([]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setHasSavedLayout(Boolean(localStorage.getItem(TRAINING_LAYOUT_STORAGE_KEY)));
  }, []);

  useEffect(() => {
    return () => {
      if (pendingLayoutChangeRef.current) {
        clearTimeout(pendingLayoutChangeRef.current);
        pendingLayoutChangeRef.current = null;
      }
      if (pendingOpenPanelsRef.current) {
        clearTimeout(pendingOpenPanelsRef.current);
        pendingOpenPanelsRef.current = null;
      }
      if (dockSubscriptionsRef.current.length) {
        dockSubscriptionsRef.current.forEach((subscription) => {
          try {
            subscription.dispose();
          } catch {}
        });
        dockSubscriptionsRef.current = [];
      }
    };
  }, []);

  const commitOpenPanels = useCallback((panelIds: string[]) => {
    setOpenPanels((prev) => {
      if (prev.length === panelIds.length && prev.every((id, index) => id === panelIds[index])) {
        return prev;
      }
      return panelIds;
    });
  }, []);

  const commitVisiblePanels = useCallback((panelIds: string[]) => {
    setVisiblePanels((prev) => {
      if (prev.length === panelIds.length && prev.every((id, index) => id === panelIds[index])) {
        return prev;
      }
      return panelIds;
    });
  }, []);

  const updateOpenPanels = useCallback(
    (panelIds: string[], immediate = false) => {
      if (pendingOpenPanelsRef.current) {
        clearTimeout(pendingOpenPanelsRef.current);
        pendingOpenPanelsRef.current = null;
      }
      if (immediate) {
        commitOpenPanels(panelIds);
        return;
      }
      const nextIds = panelIds.slice();
      pendingOpenPanelsRef.current = setTimeout(() => {
        pendingOpenPanelsRef.current = null;
        commitOpenPanels(nextIds);
      }, 100);
    },
    [commitOpenPanels],
  );

  const applyLayout = useCallback(
    (layout: DockviewLayout | { groups?: any[] }, presetId: string): boolean => {
      const api = dockApiRef.current;
      if (!api) return false;
      const expectedPanels = extractPanelIds(layout);
      suppressLayoutChangeRef.current = true;
      try {
        api.fromJSON(cloneDockLayout(layout));
        const appliedLayout = api.toJSON();
        const actualPanels = extractPanelIds(appliedLayout);
        updateOpenPanels(actualPanels, true);
        commitVisiblePanels(extractActivePanelIds(appliedLayout));
        if (expectedPanels.length === 0 || actualPanels.length > 0) {
          setCurrentLayout(presetId);
          return true;
        }
        return false;
      } catch {
        return false;
      } finally {
        suppressLayoutChangeRef.current = false;
      }
    },
    [updateOpenPanels, commitVisiblePanels],
  );

  const dockviewRootDndEdges = useMemo(
    () => ({
      activationSize: { type: "percentage", value: 6 },
      size: { type: "pixels", value: 120 },
    }),
    [],
  );

  const dockviewTheme = useMemo<DockviewTheme>(
    () => ({
      name: "stockbot",
      className: "dockview-theme-abyss",
      gap: 12,
      dndOverlayMounting: "absolute",
      dndPanelOverlay: "group",
    }),
    [],
  );

  const dockviewLog = useCallback((label: string, payload?: unknown) => {
    console.log(`[dockview] ${label}`, payload);
  }, []);

  const setPanelActive = useCallback((panel: IDockviewPanel | undefined) => {
    if (!panel) return;
    try {
      panel.api.setActive();
    } catch {}
    try {
      panel.focus();
    } catch {}
  }, []);

  const handleDockReady = useCallback(
    ({ api }: DockviewReadyEvent) => {
      dockApiRef.current = api;
      setDockReady(true);

      const dragAwareApi = api as DockviewDragAwareApi;
      dockviewLog("apiReady", {
        hasWillDragPanel: !!dragAwareApi.onWillDragPanel,
        hasWillDragGroup: !!dragAwareApi.onWillDragGroup,
        hasMovePanel: !!dragAwareApi.onDidMovePanel,
        willDragPanelType: typeof dragAwareApi.onWillDragPanel,
        keys: Object.keys(dragAwareApi),
        protoKeys: Object.getOwnPropertyNames(Object.getPrototypeOf(dragAwareApi)),
      });

      if (dockSubscriptionsRef.current.length) {
        dockSubscriptionsRef.current.forEach((subscription) => {
          try {
            subscription.dispose();
          } catch {}
        });
        dockSubscriptionsRef.current = [];
      }

      const subscribe = (disposable?: { dispose: () => void }) => {
        if (disposable) {
          dockSubscriptionsRef.current.push(disposable);
        }
      };

      subscribe(
        dragAwareApi.onWillDragPanel?.((event: TabDragEvent) => {
          const dataTransfer = event.nativeEvent.dataTransfer;
          if (dataTransfer) {
            dataTransfer.effectAllowed = "move";
            dataTransfer.dropEffect = "move";
          }
          dockviewLog("willDragPanel", { panelId: event.panel.id });
        }),
      );

      subscribe(
        dragAwareApi.onWillDragGroup?.((event: GroupDragEvent) => {
          const dataTransfer = event.nativeEvent.dataTransfer;
          if (dataTransfer) {
            dataTransfer.effectAllowed = "move";
            dataTransfer.dropEffect = "move";
          }
          dockviewLog("willDragGroup", { groupId: event.group.id });
        }),
      );

      subscribe(
        dragAwareApi.onDidMovePanel?.((event: MovePanelEvent) => {
          dockviewLog("panelMoved", { panelId: event.panel.id, fromGroup: event.from.id });
        }),
      );
      subscribe(
        dragAwareApi.onDidAddGroup?.((group: DockviewGroupPanel) => {
          dockviewLog("groupAdded", { groupId: group.id, location: group.api.location.type });
        }),
      );
      subscribe(
        dragAwareApi.onDidRemoveGroup?.((group: DockviewGroupPanel) => {
          dockviewLog("groupRemoved", { groupId: group.id });
        }),
      );
      subscribe(
        dragAwareApi.onDidLayoutChange?.(() => {
          dockviewLog("layoutChange", dragAwareApi.toJSON());
        }),
      );
      subscribe(
        dragAwareApi.onDidActivePanelChange?.(() => {
          if (suppressLayoutChangeRef.current) return;
          try {
            commitVisiblePanels(extractActivePanelIds(dragAwareApi.toJSON()));
          } catch {}
        }),
      );

      let initialLayout: DockviewLayout | { groups?: any[] } = defaultDockLayout;
      let layoutId: string = "default";

      if (typeof window !== "undefined") {
        try {
          const raw = localStorage.getItem(TRAINING_LAYOUT_STORAGE_KEY);
          if (raw) {
            const parsed = JSON.parse(raw) as DockviewLayout | { groups?: any[] };
            initialLayout = parsed;
            layoutId = "saved";
          }
        } catch {
          initialLayout = defaultDockLayout;
          layoutId = "default";
        }
      }

      const applied = applyLayout(initialLayout, layoutId);
      if (!applied && layoutId === "saved") {
        try {
          localStorage.removeItem(TRAINING_LAYOUT_STORAGE_KEY);
          setHasSavedLayout(false);
        } catch {}
        applyLayout(defaultDockLayout, "default");
      }
    },
    [applyLayout, dockviewLog, commitVisiblePanels],
  );

  const handleLayoutChange = useCallback(
    (layout: DockviewLayout) => {
      updateOpenPanels(extractPanelIds(layout));
      commitVisiblePanels(extractActivePanelIds(layout));
      if (suppressLayoutChangeRef.current) return;
      if (pendingLayoutChangeRef.current) clearTimeout(pendingLayoutChangeRef.current);
      pendingLayoutChangeRef.current = setTimeout(() => {
        pendingLayoutChangeRef.current = null;
        try {
          localStorage.setItem(TRAINING_LAYOUT_STORAGE_KEY, JSON.stringify(layout));
          setHasSavedLayout(true);
          setCurrentLayout("custom");
        } catch {}
      }, 400);
    },
    [updateOpenPanels, commitVisiblePanels],
  );

  const handlePresetChange = useCallback(
    (presetId: string) => {
      if (presetId === "saved") {
        try {
          const raw = localStorage.getItem(TRAINING_LAYOUT_STORAGE_KEY);
          if (!raw) return;
          const parsed = JSON.parse(raw) as DockviewLayout | { groups?: any[] };
          if (!applyLayout(parsed, "saved")) {
            localStorage.removeItem(TRAINING_LAYOUT_STORAGE_KEY);
            setHasSavedLayout(false);
            applyLayout(defaultDockLayout, "default");
          }
        } catch {}
        return;
      }
      if (presetId === "custom") {
        setCurrentLayout("custom");
        return;
      }
      const preset = DOCK_PRESETS.find((p) => p.id === presetId);
      if (preset) applyLayout(preset.layout, presetId);
    },
    [applyLayout],
  );

  const handleSaveLayout = useCallback(() => {
    const api = dockApiRef.current;
    if (!api) return;
    try {
      const json = api.toJSON();
      localStorage.setItem(TRAINING_LAYOUT_STORAGE_KEY, JSON.stringify(json));
      setHasSavedLayout(true);
      setCurrentLayout("saved");
    } catch {}
  }, []);

  const handleLoadSavedLayout = useCallback(() => {
    try {
      const raw = localStorage.getItem(TRAINING_LAYOUT_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as DockviewLayout | { groups?: any[] };
      if (!applyLayout(parsed, "saved")) {
        localStorage.removeItem(TRAINING_LAYOUT_STORAGE_KEY);
        setHasSavedLayout(false);
        applyLayout(defaultDockLayout, "default");
      }
    } catch {}
  }, [applyLayout]);

  const handleClearSavedLayout = useCallback(() => {
    try {
      localStorage.removeItem(TRAINING_LAYOUT_STORAGE_KEY);
      setHasSavedLayout(false);
    } catch {}
  }, []);

  const handlePanelLaunch = useCallback(
    (panelKey: PanelKey) => {
      const api = dockApiRef.current;
      if (!api) return;
      const panel = panelDefinitions[panelKey];
      if (!panel) return;

      const existing = api.getPanel(panel.id);
      if (existing) {
        setPanelActive(existing);
        return;
      }

      const created = api.addPanel({
        id: panel.id,
        component: panel.component,
        title: panel.title,
      });
      setPanelActive(created);
      try {
        const layout = api.toJSON();
        updateOpenPanels(extractPanelIds(layout), true);
        commitVisiblePanels(extractActivePanelIds(layout));
      } catch {}
      setCurrentLayout("custom");
    },
    [setPanelActive, updateOpenPanels, commitVisiblePanels],
  );

  const focusPanel = useCallback(
    (panelId: string) => {
      const api = dockApiRef.current;
      if (!api) return;
      setPanelActive(api.getPanel(panelId));
    },
    [setPanelActive],
  );

  return {
    dockReady,
    openPanels,
    visiblePanels,
    currentLayout,
    hasSavedLayout,
    dockviewRootDndEdges,
    dockviewTheme,
    handleDockReady,
    handleLayoutChange,
    handlePresetChange,
    handleSaveLayout,
    handleLoadSavedLayout,
    handleClearSavedLayout,
    handlePanelLaunch,
    focusPanel,
    applyLayout,
  };
}
