import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";

export interface DockviewPanel {
  id: string;
  component: string;
  title: string;
  params?: any;
}

export interface DockviewGroup {
  id: string;
  size?: number;
  tabs: DockviewPanel[];
  active?: string;
}

export interface DockviewLayout {
  groups: DockviewGroup[];
}

export interface AddPanelOptions {
  id?: string;
  title: string;
  component: string;
  params?: any;
  size?: number;
  position?:
    | { groupId: string; index?: number }
    | { referencePanelId: string; direction?: "left" | "right" | "center" };
}

export interface DockviewPanelApi {
  id: string;
  title: string;
  updateOptions(options: { title?: string; params?: any }): void;
  focus(): void;
  close(): void;
}

export interface DockviewApi {
  addPanel(options: AddPanelOptions): DockviewPanelApi;
  closePanel(panelId: string): void;
  focusPanel(panelId: string): void;
  toJSON(): DockviewLayout;
  fromJSON(layout: DockviewLayout): void;
}

export interface DockviewReadyEvent {
  api: DockviewApi;
}

export interface DockviewPanelProps<T = any> {
  params?: T;
  panelApi: DockviewPanelApi;
}

export interface DockviewReactProps {
  components: Record<string, React.ComponentType<DockviewPanelProps>>;
  className?: string;
  style?: CSSProperties;
  onReady?: (event: DockviewReadyEvent) => void;
  onLayoutChange?: (layout: DockviewLayout) => void;
}

interface PanelLocation {
  groupIndex: number;
  panelIndex: number;
}

const cloneLayout = (layout: DockviewLayout): DockviewLayout => ({
  groups: layout.groups.map((group) => ({
    ...group,
    tabs: group.tabs.map((tab) => ({ ...tab })),
  })),
});

const createId = (() => {
  let counter = 0;
  return (prefix: string) => `${prefix}-${++counter}`;
})();

export const DockviewReact: React.FC<DockviewReactProps> = ({
  components,
  className,
  style,
  onReady,
  onLayoutChange,
}) => {
  const [layout, setLayoutState] = useState<DockviewLayout>({ groups: [] });
  const layoutRef = useRef(layout);
  const draggingIdRef = useRef<string | null>(null);
  const [dragOver, setDragOver] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const resizeCleanupRef = useRef<(() => void) | null>(null);
  const [resizingIndex, setResizingIndex] = useState<number | null>(null);
  const panelApis = useRef(new Map<string, DockviewPanelApi>());

  const setLayout = useCallback(
    (updater: (prev: DockviewLayout) => DockviewLayout) => {
      setLayoutState((prev) => {
        const next = updater(prev);
        layoutRef.current = next;
        onLayoutChange?.(cloneLayout(next));
        return next;
      });
    },
    [onLayoutChange]
  );

  const findPanel = useCallback((panelId: string): PanelLocation | null => {
    const groups = layoutRef.current.groups;
    for (let gi = 0; gi < groups.length; gi++) {
      const tabs = groups[gi].tabs;
      for (let pi = 0; pi < tabs.length; pi++) {
        if (tabs[pi].id === panelId) {
          return { groupIndex: gi, panelIndex: pi };
        }
      }
    }
    return null;
  }, []);

  const removePanel = useCallback((panelId: string) => {
    setLayout((prev) => {
      const next = cloneLayout(prev);
      const loc = findPanel(panelId);
      if (!loc) return prev;
      const group = next.groups[loc.groupIndex];
      group.tabs.splice(loc.panelIndex, 1);
      if (group.active === panelId) {
        group.active = group.tabs[0]?.id;
      }
      if (group.tabs.length === 0) {
        next.groups.splice(loc.groupIndex, 1);
      }
      return next;
    });
  }, [findPanel, setLayout]);

  const focusPanelInternal = useCallback((panelId: string) => {
    setLayout((prev) => {
      const next = cloneLayout(prev);
      const loc = findPanel(panelId);
      if (!loc) return prev;
      const group = next.groups[loc.groupIndex];
      group.active = panelId;
      return next;
    });
  }, [findPanel, setLayout]);

  const ensurePanelApi = useCallback(
    (panel: DockviewPanel): DockviewPanelApi => {
      if (panelApis.current.has(panel.id)) {
        return panelApis.current.get(panel.id)!;
      }
      const api: DockviewPanelApi = {
        id: panel.id,
        title: panel.title,
        updateOptions(options) {
          setLayout((prev) => {
            const next = cloneLayout(prev);
            const loc = findPanel(panel.id);
            if (!loc) return prev;
            const target = next.groups[loc.groupIndex].tabs[loc.panelIndex];
            if (options.title) target.title = options.title;
            if (options.params !== undefined) target.params = options.params;
            api.title = target.title;
            return next;
          });
        },
        focus() {
          focusPanelInternal(panel.id);
        },
        close() {
          removePanel(panel.id);
        },
      };
      panelApis.current.set(panel.id, api);
      return api;
    },
    [findPanel, focusPanelInternal, removePanel, setLayout]
  );

  const insertPanel = useCallback(
    (panel: DockviewPanel, targetGroup: number, index?: number, size?: number) => {
      setLayout((prev) => {
        const next = cloneLayout(prev);
        if (targetGroup < 0 || targetGroup > next.groups.length) {
          next.groups.push({ id: createId("group"), tabs: [panel], active: panel.id, size });
          return next;
        }
        if (!next.groups[targetGroup]) {
          next.groups.splice(targetGroup, 0, { id: createId("group"), tabs: [], active: panel.id, size });
        }
        const group = next.groups[targetGroup];
        if (size !== undefined) group.size = size;
        if (index === undefined || index < 0 || index > group.tabs.length) {
          group.tabs.push(panel);
        } else {
          group.tabs.splice(index, 0, panel);
        }
        group.active = panel.id;
        return next;
      });
    },
    [setLayout]
  );

  const addPanel = useCallback(
    (options: AddPanelOptions): DockviewPanelApi => {
      const panel: DockviewPanel = {
        id: options.id || createId("panel"),
        component: options.component,
        title: options.title,
        params: options.params,
      };
      let targetGroup = layoutRef.current.groups.length;
      let index: number | undefined = undefined;
      let size = options.size;
      if (options.position && "groupId" in options.position) {
        const groupIndex = layoutRef.current.groups.findIndex((g) => g.id === options.position!.groupId);
        if (groupIndex !== -1) {
          targetGroup = groupIndex;
          index = options.position.index;
        }
      } else if (options.position && "referencePanelId" in options.position) {
        const loc = findPanel(options.position.referencePanelId);
        if (loc) {
          targetGroup =
            options.position.direction === "left"
              ? loc.groupIndex
              : options.position.direction === "center"
              ? loc.groupIndex
              : loc.groupIndex + 1;
          if (options.position.direction === "center") {
            index = loc.panelIndex + 1;
          }
        }
      }
      insertPanel(panel, targetGroup, index, size);
      return ensurePanelApi(panel);
    },
    [ensurePanelApi, findPanel, insertPanel]
  );

  const closePanel = useCallback(
    (panelId: string) => {
      removePanel(panelId);
      panelApis.current.delete(panelId);
    },
    [removePanel]
  );

  const fromJSON = useCallback(
    (nextLayout: DockviewLayout) => {
      const validGroups = (nextLayout.groups || []).map((group) => ({
        id: group.id || createId("group"),
        size: group.size,
        active: group.active,
        tabs: (group.tabs || [])
          .filter((tab) => components[tab.component])
          .map((tab) => ({
            id: tab.id || createId("panel"),
            component: tab.component,
            title: tab.title || tab.component,
            params: tab.params,
          })),
      }));
      setLayout(() => ({ groups: validGroups }));
      panelApis.current.clear();
    },
    [components, setLayout]
  );

  const toJSON = useCallback(() => cloneLayout(layoutRef.current), []);

  useEffect(() => {
    const api: DockviewApi = {
      addPanel,
      closePanel,
      focusPanel: focusPanelInternal,
      toJSON,
      fromJSON,
    };
    onReady?.({ api });
  }, [addPanel, closePanel, focusPanelInternal, fromJSON, onReady, toJSON]);

  const handleDragStart = (panelId: string) => {
    draggingIdRef.current = panelId;
  };

  const handleDragEnd = () => {
    draggingIdRef.current = null;
    setDragOver(null);
  };

  const movePanel = useCallback(
    (panelId: string, targetGroupIndex: number, targetIndex?: number, size?: number) => {
      const loc = findPanel(panelId);
      if (!loc) return;
      if (loc.groupIndex === targetGroupIndex && (targetIndex === undefined || loc.panelIndex === targetIndex)) {
        return;
      }
      const panel = layoutRef.current.groups[loc.groupIndex].tabs[loc.panelIndex];
      setLayout((prev) => {
        const next = cloneLayout(prev);
        const currentLoc = findPanel(panelId);
        if (!currentLoc) return prev;
        const sourceGroup = next.groups[currentLoc.groupIndex];
        const [removed] = sourceGroup.tabs.splice(currentLoc.panelIndex, 1);
        if (sourceGroup.active === removed.id) {
          sourceGroup.active = sourceGroup.tabs[0]?.id;
        }
        if (sourceGroup.tabs.length === 0) {
          next.groups.splice(currentLoc.groupIndex, 1);
          if (targetGroupIndex > currentLoc.groupIndex) targetGroupIndex -= 1;
        }
        const target = next.groups[targetGroupIndex];
        if (target) {
          if (size !== undefined) target.size = size;
          if (targetIndex === undefined || targetIndex < 0 || targetIndex > target.tabs.length) {
            target.tabs.push(removed);
          } else {
            target.tabs.splice(targetIndex, 0, removed);
          }
          target.active = removed.id;
        } else {
          next.groups.splice(targetGroupIndex, 0, {
            id: createId("group"),
            size,
            active: removed.id,
            tabs: [removed],
          });
        }
        return next;
      });
    },
    [findPanel, setLayout]
  );

  const handleGroupDrop = (groupIndex: number, index?: number) => {
    const draggingId = draggingIdRef.current;
    if (!draggingId) return;
    movePanel(draggingId, groupIndex, index);
    setDragOver(null);
  };

  const handleCreateGroupDrop = (insertIndex: number) => {
    const draggingId = draggingIdRef.current;
    if (!draggingId) return;
    movePanel(draggingId, insertIndex, 0);
    setDragOver(null);
  };

  const renderedGroups = useMemo(() => layout.groups, [layout.groups]);

  useEffect(() => {
    return () => {
      if (resizeCleanupRef.current) {
        resizeCleanupRef.current();
        resizeCleanupRef.current = null;
      }
    };
  }, []);

  const handleResizeStart = useCallback(
    (groupIndex: number, event: React.PointerEvent<HTMLButtonElement>) => {
      if (event.pointerType === "mouse" && event.button !== 0) return;
      const container = containerRef.current;
      if (!container) return;
      const groups = layoutRef.current.groups;
      if (!groups[groupIndex] || !groups[groupIndex + 1]) return;

      event.preventDefault();
      event.stopPropagation();

      const pointerId = event.pointerId;
      const startX = event.clientX;
      const containerWidth = container.getBoundingClientRect().width;
      if (!Number.isFinite(containerWidth) || containerWidth <= 0) return;

      const totalSize = groups.reduce((sum, g) => sum + (g.size ?? 1), 0);
      const leftSize = groups[groupIndex].size ?? 1;
      const rightSize = groups[groupIndex + 1].size ?? 1;
      const pairTotal = leftSize + rightSize;
      if (!Number.isFinite(pairTotal) || pairTotal <= 0) return;

      const MIN_GROUP_WIDTH = 260;
      const minNormalized = Math.min(
        pairTotal / 2,
        (MIN_GROUP_WIDTH / containerWidth) * totalSize
      );

      let lastLeft = leftSize;
      let frame: number | null = null;

      const updateSizes = (clientX: number) => {
        const deltaPx = clientX - startX;
        const deltaSize = (deltaPx / containerWidth) * totalSize;
        let nextLeft = leftSize + deltaSize;
        const clampMin = Number.isFinite(minNormalized) && minNormalized > 0 ? minNormalized : pairTotal / 2;
        const lower = clampMin;
        const upper = pairTotal - clampMin;
        if (nextLeft < lower) nextLeft = lower;
        if (nextLeft > upper) nextLeft = upper;
        if (Math.abs(nextLeft - lastLeft) < 1e-4) return;
        lastLeft = nextLeft;
        const nextRight = pairTotal - nextLeft;
        if (frame) cancelAnimationFrame(frame);
        frame = window.requestAnimationFrame(() => {
          setLayout((prev) => {
            const next = cloneLayout(prev);
            if (!next.groups[groupIndex] || !next.groups[groupIndex + 1]) return prev;
            next.groups[groupIndex].size = nextLeft;
            next.groups[groupIndex + 1].size = nextRight;
            return next;
          });
        });
      };

      const handlePointerMove = (ev: PointerEvent) => {
        if (ev.pointerId !== pointerId) return;
        updateSizes(ev.clientX);
      };

      const cleanup = () => {
        if (frame) {
          cancelAnimationFrame(frame);
          frame = null;
        }
        window.removeEventListener("pointermove", handlePointerMove);
        window.removeEventListener("pointerup", handlePointerUp);
        window.removeEventListener("pointercancel", handlePointerUp);
        try {
          if (event.currentTarget.hasPointerCapture(pointerId)) {
            event.currentTarget.releasePointerCapture(pointerId);
          }
        } catch {}
        document.body.style.cursor = "";
        resizeCleanupRef.current = null;
        setDragOver((prev) => (prev && prev.startsWith("split-") ? null : prev));
        setResizingIndex(null);
      };

      const handlePointerUp = (ev: PointerEvent) => {
        if (ev.pointerId !== pointerId) return;
        cleanup();
      };

      resizeCleanupRef.current?.();
      resizeCleanupRef.current = cleanup;
      setResizingIndex(groupIndex);
      document.body.style.cursor = "col-resize";

      window.addEventListener("pointermove", handlePointerMove);
      window.addEventListener("pointerup", handlePointerUp);
      window.addEventListener("pointercancel", handlePointerUp);

      try {
        event.currentTarget.setPointerCapture(pointerId);
      } catch {}
    },
    [setLayout]
  );

  return (
    <div
      ref={containerRef}
      className={["dv-root", className || ""].join(" ").trim()}
      style={style}
    >
      <div
        className={["dv-drop-zone", "dv-drop-zone-outer", dragOver === "left" ? "dv-drop-active" : ""].join(" ").trim()}
        onDragOver={(e) => {
          if (draggingIdRef.current) {
            e.preventDefault();
            setDragOver("left");
          }
        }}
        onDragLeave={() => setDragOver(null)}
        onDrop={(e) => {
          e.preventDefault();
          handleCreateGroupDrop(0);
          setDragOver(null);
        }}
      />
      {renderedGroups.map((group, groupIndex) => {
        const activeId = group.active || group.tabs[0]?.id;
        const activePanel = group.tabs.find((t) => t.id === activeId) || group.tabs[0];
        return (
          <React.Fragment key={group.id}>
            <div
              className="dv-group"
              style={{ flexGrow: group.size ?? 1, flexBasis: 0 }}
              onDragOver={(e) => {
                if (!draggingIdRef.current) return;
                e.preventDefault();
                setDragOver(group.id);
              }}
              onDrop={(e) => {
                e.preventDefault();
                if (draggingIdRef.current) {
                  handleGroupDrop(groupIndex);
                }
                setDragOver(null);
              }}
            >
              <div className="dv-tabs">
                {group.tabs.map((tab, tabIndex) => {
                  const Component = components[tab.component];
                  const api = ensurePanelApi(tab);
                  const isActive = tab.id === activeId;
                  return (
                    <div
                      key={tab.id}
                      role="tab"
                      aria-selected={isActive}
                      tabIndex={0}
                      className={["dv-tab", isActive ? "dv-tab-active" : ""].join(" ").trim()}
                      draggable
                      onDragStart={() => handleDragStart(tab.id)}
                      onDragEnd={handleDragEnd}
                      onClick={() => focusPanelInternal(tab.id)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          focusPanelInternal(tab.id);
                        }
                      }}
                      onDragOver={(e) => {
                        if (!draggingIdRef.current || draggingIdRef.current === tab.id) return;
                        e.preventDefault();
                        setDragOver(`${group.id}:${tab.id}`);
                      }}
                      onDrop={(e) => {
                        e.preventDefault();
                        const draggingId = draggingIdRef.current;
                        if (!draggingId || draggingId === tab.id) return;
                        handleGroupDrop(groupIndex, tabIndex);
                        setDragOver(null);
                      }}
                    >
                      <span className="dv-tab-title">{tab.title}</span>
                      <button
                        type="button"
                        className="dv-tab-close"
                        onClick={(ev) => {
                          ev.stopPropagation();
                          closePanel(tab.id);
                        }}
                      >
                        ×
                      </button>
                    </div>
                  );
                })}
              </div>
              <div className="dv-group-content">
                {activePanel ? (
                  <div className="dv-panel">
                    {(() => {
                      const Component = components[activePanel.component];
                      if (!Component) {
                        return (
                          <div className="dv-empty">Unknown component: {activePanel.component}</div>
                        );
                      }
                      const api = ensurePanelApi(activePanel);
                      return <Component params={activePanel.params} panelApi={api} />;
                    })()}
                  </div>
                ) : (
                  <div className="dv-empty">Drop a panel here</div>
                )}
              </div>
            </div>
            <div className="dv-splitter">
              <div
                className={[
                  "dv-drop-zone",
                  dragOver === `split-${groupIndex}` ? "dv-drop-active" : "",
                ].join(" ").trim()}
                onDragOver={(e) => {
                  if (!draggingIdRef.current) return;
                  e.preventDefault();
                  setDragOver(`split-${groupIndex}`);
                }}
                onDragLeave={() => setDragOver(null)}
                onDrop={(e) => {
                  e.preventDefault();
                  handleCreateGroupDrop(groupIndex + 1);
                  setDragOver(null);
                }}
              />
              {groupIndex < renderedGroups.length - 1 && (
                <button
                  type="button"
                  aria-label="Resize panels"
                  className={[
                    "dv-resize-handle",
                    resizingIndex === groupIndex ? "dv-resize-active" : "",
                  ]
                    .join(" ")
                    .trim()}
                  onPointerDown={(e) => handleResizeStart(groupIndex, e)}
                >
                  <span className="dv-resize-grip" />
                </button>
              )}
            </div>
          </React.Fragment>
        );
      })}
    </div>
  );
};
