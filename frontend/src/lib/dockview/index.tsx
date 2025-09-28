"use client";

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

export interface DockviewGroupNode extends DockviewGroup {
  type: "group";
}

export interface DockviewSplitNode {
  id: string;
  type: "split";
  size?: number;
  orientation: "horizontal" | "vertical";
  children: DockviewNode[];
}

export type DockviewNode = DockviewGroupNode | DockviewSplitNode;

export interface DockviewLayout {
  root: DockviewNode | null;
  version?: "2";
}

export interface AddPanelOptions {
  id?: string;
  title: string;
  component: string;
  params?: any;
  size?: number;
  position?:
    | { groupId: string; index?: number }
    | {
        referencePanelId: string;
        direction?: "left" | "right" | "top" | "bottom" | "center";
      };
}

export interface DockviewPanelApi {
  id: string;
  title: string;
  params?: any;
  setTitle(title: string): void;
  updateParameters(parameters: Record<string, any>): void;
  focus(): void;
  close(): void;
}

export interface DockviewApi {
  addPanel(options: AddPanelOptions): DockviewPanelApi;
  closePanel(panelId: string): void;
  focusPanel(panelId: string): void;
  getPanel(panelId: string): DockviewPanelApi | undefined;
  toJSON(): DockviewLayout;
  fromJSON(layout: DockviewLayout | { groups?: DockviewGroup[] }): void;
}

export interface DockviewReadyEvent {
  api: DockviewApi;
}

export interface DockviewPanelProps<T = any> {
  params?: T;
  api: DockviewPanelApi;
}

export interface DockviewReactProps {
  components: Record<string, React.ComponentType<DockviewPanelProps>>;
  className?: string;
  style?: CSSProperties;
  onReady?: (event: DockviewReadyEvent) => void;
  onLayoutChange?: (layout: DockviewLayout) => void;
}

interface PanelLocation {
  groupPath: number[];
  panelIndex: number;
  groupId: string;
}

interface GroupPathResult {
  path: number[];
  group: DockviewGroupNode;
}

type GroupDropPosition = "center" | "left" | "right" | "top" | "bottom";

type DropTarget =
  | {
      type: "group";
      path: number[];
      position: GroupDropPosition;
      tabIndex?: number;
    }
  | {
      type: "split";
      path: number[];
      index: number;
    };

const isGroupNode = (node: DockviewNode | null): node is DockviewGroupNode =>
  Boolean(node && node.type === "group");

const isSplitNode = (node: DockviewNode | null): node is DockviewSplitNode =>
  Boolean(node && node.type === "split");

const clonePanel = (panel: DockviewPanel): DockviewPanel => ({ ...panel });

const cloneNode = (node: DockviewNode): DockviewNode => {
  if (isGroupNode(node)) {
    return {
      ...node,
      tabs: node.tabs.map(clonePanel),
    };
  }
  return {
    ...node,
    children: node.children.map(cloneNode),
  };
};

const cloneLayout = (layout: DockviewLayout): DockviewLayout => ({
  root: layout.root ? cloneNode(layout.root) : null,
  version: "2",
});

const pathToKey = (path: number[]): string => (path.length === 0 ? "root" : path.join("."));

const arraysEqual = (a: number[], b: number[]): boolean =>
  a.length === b.length && a.every((value, index) => value === b[index]);

const getNodeAtPath = (node: DockviewNode | null, path: number[]): DockviewNode | null => {
  let current: DockviewNode | null = node;
  for (const segment of path) {
    if (!isSplitNode(current)) return null;
    current = current.children[segment] ?? null;
    if (!current) return null;
  }
  return current;
};

const findPanelInNode = (
  node: DockviewNode,
  panelId: string,
  path: number[]
): PanelLocation | null => {
  if (isGroupNode(node)) {
    const index = node.tabs.findIndex((tab) => tab.id === panelId);
    if (index !== -1) {
      return { groupPath: path, panelIndex: index, groupId: node.id };
    }
    return null;
  }
  for (let i = 0; i < node.children.length; i++) {
    const result = findPanelInNode(node.children[i], panelId, [...path, i]);
    if (result) return result;
  }
  return null;
};

const findPanelInLayout = (layout: DockviewLayout, panelId: string): PanelLocation | null => {
  if (!layout.root) return null;
  return findPanelInNode(layout.root, panelId, []);
};

const findGroupPathById = (
  node: DockviewNode | null,
  groupId: string,
  path: number[] = []
): number[] | null => {
  if (!node) return null;
  if (isGroupNode(node)) {
    return node.id === groupId ? path : null;
  }
  for (let i = 0; i < node.children.length; i++) {
    const result = findGroupPathById(node.children[i], groupId, [...path, i]);
    if (result) return result;
  }
  return null;
};

const findFirstGroupPath = (node: DockviewNode | null): GroupPathResult | null => {
  if (!node) return null;
  if (isGroupNode(node)) {
    return { path: [], group: node };
  }
  for (let i = 0; i < node.children.length; i++) {
    const child = node.children[i];
    const result = findFirstGroupPath(child);
    if (result) {
      return {
        path: [i, ...result.path],
        group: result.group,
      };
    }
  }
  return null;
};

const layoutContainsGroupId = (node: DockviewNode | null, groupId: string): boolean => {
  if (!node) return false;
  if (isGroupNode(node)) {
    return node.id === groupId;
  }
  return node.children.some((child) => layoutContainsGroupId(child, groupId));
};

const removeGroupAtPath = (layout: DockviewLayout, path: number[]) => {
  if (!layout.root) return;
  if (path.length === 0) {
    layout.root = null;
    return;
  }
  const parentPath = path.slice(0, -1);
  const parent = getNodeAtPath(layout.root, parentPath);
  if (!isSplitNode(parent)) return;
  const index = path[path.length - 1];
  parent.children.splice(index, 1);
};

const normalizeNode = (node: DockviewNode | null): DockviewNode | null => {
  if (!node) return null;
  if (isGroupNode(node)) {
    if (node.tabs.length === 0) {
      return null;
    }
    if (node.active && !node.tabs.some((tab) => tab.id === node.active)) {
      node.active = node.tabs[0]?.id;
    }
    return node;
  }
  const normalizedChildren: DockviewNode[] = [];
  for (const child of node.children) {
    const normalized = normalizeNode(child);
    if (normalized) {
      normalizedChildren.push(normalized);
    }
  }
  node.children = normalizedChildren;
  if (node.children.length === 0) {
    return null;
  }
  if (node.children.length === 1) {
    const only = node.children[0];
    if (node.size !== undefined) {
      only.size = node.size;
    }
    return only;
  }
  return node;
};

const normalizeLayout = (layout: DockviewLayout): DockviewLayout => ({
  root: normalizeNode(layout.root),
  version: "2",
});

const ensureGroupActive = (group: DockviewGroupNode) => {
  if (!group.active || !group.tabs.some((tab) => tab.id === group.active)) {
    group.active = group.tabs[0]?.id;
  }
};

const insertPanelIntoGroup = (
  layout: DockviewLayout,
  path: number[],
  panel: DockviewPanel,
  index?: number
): string | null => {
  const node = getNodeAtPath(layout.root, path);
  if (!isGroupNode(node)) return null;
  let insertIndex = index;
  if (insertIndex === undefined || insertIndex < 0 || insertIndex > node.tabs.length) {
    node.tabs.push(panel);
  } else {
    node.tabs.splice(insertIndex, 0, panel);
  }
  node.active = panel.id;
  return node.id;
};

const insertPanelAsSplitNode = (
  layout: DockviewLayout,
  path: number[],
  position: Exclude<GroupDropPosition, "center">,
  panel: DockviewPanel,
  preferredSize?: number
): string | null => {
  const target = getNodeAtPath(layout.root, path);
  if (!isGroupNode(target)) return null;

  const orientation = position === "left" || position === "right" ? "horizontal" : "vertical";
  const before = position === "left" || position === "top";
  const targetBase = Math.max(target.size ?? 1, 0.5);
  const newSize =
    preferredSize !== undefined ? Math.max(preferredSize, 0.5) : Math.max(targetBase / 2, 0.5);
  const targetSize = preferredSize !== undefined ? targetBase : Math.max(targetBase / 2, 0.5);
  const newGroup: DockviewGroupNode = {
    type: "group",
    id: createId("group"),
    tabs: [panel],
    active: panel.id,
    size: newSize,
  };

  if (path.length === 0) {
    target.size = targetSize;
    const split: DockviewSplitNode = {
      type: "split",
      id: createId("split"),
      orientation,
      children: before ? [newGroup, target] : [target, newGroup],
    };
    layout.root = split;
    return newGroup.id;
  }

  const parentPath = path.slice(0, -1);
  const parent = getNodeAtPath(layout.root, parentPath);
  if (!isSplitNode(parent)) return null;
  const childIndex = path[path.length - 1];

  if (parent.orientation === orientation) {
    const insertIndex = before ? childIndex : childIndex + 1;
    target.size = targetSize;
    parent.children.splice(insertIndex, 0, newGroup);
    return newGroup.id;
  }

  const split: DockviewSplitNode = {
    type: "split",
    id: createId("split"),
    orientation,
    size: target.size,
    children: before ? [newGroup, target] : [target, newGroup],
  };
  target.size = preferredSize !== undefined ? targetBase : 1;
  newGroup.size = preferredSize !== undefined ? newSize : 1;
  parent.children[childIndex] = split;
  return newGroup.id;
};

const insertPanelIntoSplitNode = (
  layout: DockviewLayout,
  path: number[],
  index: number,
  panel: DockviewPanel,
  preferredSize?: number
): string | null => {
  const split = getNodeAtPath(layout.root, path);
  if (!isSplitNode(split)) return null;
  const newGroup: DockviewGroupNode = {
    type: "group",
    id: createId("group"),
    tabs: [panel],
    active: panel.id,
    size: preferredSize,
  };
  const clampedIndex = Math.max(0, Math.min(index, split.children.length));
  if (split.children.length > 0) {
    const neighborIndex = clampedIndex === split.children.length ? clampedIndex - 1 : clampedIndex;
    const neighbor = split.children[neighborIndex];
    const neighborBase = Math.max(neighbor.size ?? 1, 0.5);
    if (preferredSize !== undefined) {
      neighbor.size = neighborBase;
      newGroup.size = Math.max(preferredSize, 0.5);
    } else {
      const half = Math.max(neighborBase / 2, 0.5);
      neighbor.size = half;
      newGroup.size = half;
    }
  } else {
    newGroup.size = Math.max(preferredSize ?? 1, 0.5);
  }
  split.children.splice(clampedIndex, 0, newGroup);
  return newGroup.id;
};

const collectPanelIds = (node: DockviewNode | null, result: string[]) => {
  if (!node) return;
  if (isGroupNode(node)) {
    node.tabs.forEach((tab) => result.push(tab.id));
    return;
  }
  node.children.forEach((child) => collectPanelIds(child, result));
};

const mapPanels = (
  panels: DockviewPanel[] | undefined,
  components: Record<string, React.ComponentType<DockviewPanelProps>>
): DockviewPanel[] => {
  if (!Array.isArray(panels)) return [];
  return panels
    .filter((panel): panel is DockviewPanel => Boolean(panel && components[panel.component]))
    .map((panel) => ({
      id: panel.id || createId("panel"),
      component: panel.component,
      title: panel.title || panel.component,
      params: panel.params,
    }));
};

const normalizeImportedNode = (
  node: any,
  components: Record<string, React.ComponentType<DockviewPanelProps>>
): DockviewNode | null => {
  if (!node) return null;
  if (node.type === "split" || Array.isArray(node.children)) {
    const orientation = node.orientation === "vertical" ? "vertical" : "horizontal";
    const children = (node.children ?? [])
      .map((child: any) => normalizeImportedNode(child, components))
      .filter((child): child is DockviewNode => Boolean(child));
    if (children.length === 0) return null;
    return {
      type: "split",
      id: node.id || createId("split"),
      orientation,
      size: typeof node.size === "number" ? node.size : undefined,
      children,
    };
  }
  const tabs = mapPanels(node.tabs, components);
  if (tabs.length === 0) return null;
  const active = node.active && tabs.some((tab) => tab.id === node.active)
    ? node.active
    : tabs[0]?.id;
  return {
    type: "group",
    id: node.id || createId("group"),
    size: typeof node.size === "number" ? node.size : undefined,
    active,
    tabs,
  };
};

const convertLegacyLayout = (
  legacy: { groups?: DockviewGroup[] } | null | undefined,
  components: Record<string, React.ComponentType<DockviewPanelProps>>
): DockviewLayout => {
  const groups = Array.isArray(legacy?.groups) ? legacy!.groups : [];
  if (groups.length === 0) {
    return { root: null, version: "2" };
  }
  const nodes = groups
    .map((group) => ({
      type: "group" as const,
      id: group.id || createId("group"),
      size: group.size,
      active: group.active,
      tabs: mapPanels(group.tabs, components),
    }))
    .filter((group) => group.tabs.length > 0);
  if (nodes.length === 0) {
    return { root: null, version: "2" };
  }
  if (nodes.length === 1) {
    const single = nodes[0];
    ensureGroupActive(single);
    return { root: single, version: "2" };
  }
  return {
    root: {
      type: "split",
      id: createId("split"),
      orientation: "horizontal",
      children: nodes.map((group) => {
        ensureGroupActive(group);
        return group;
      }),
    },
    version: "2",
  };
};

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
  const componentsRef = useRef(components);
  const [layout, setLayoutState] = useState<DockviewLayout>({ root: null, version: "2" });
  const layoutRef = useRef(layout);
  const draggingIdRef = useRef<string | null>(null);
  const [dragOver, setDragOver] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const resizeCleanupRef = useRef<(() => void) | null>(null);
  const [resizingHandle, setResizingHandle] = useState<string | null>(null);
  const panelApis = useRef(new Map<string, DockviewPanelApi>());
  const activeGroupIdRef = useRef<string | null>(null);

  useEffect(() => {
    componentsRef.current = components;
  }, [components]);

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

  const findPanel = useCallback(
    (panelId: string): PanelLocation | null => findPanelInLayout(layoutRef.current, panelId),
    []
  );

  const removePanel = useCallback(
    (panelId: string) => {
      setLayout((prev) => {
        const next = cloneLayout(prev);
        const loc = findPanelInLayout(next, panelId);
        if (!loc) return prev;
        const group = getNodeAtPath(next.root, loc.groupPath);
        if (!isGroupNode(group)) return prev;
        const [removed] = group.tabs.splice(loc.panelIndex, 1);
        if (!removed) return prev;
        panelApis.current.delete(removed.id);
        if (group.active === panelId) {
          ensureGroupActive(group);
        }
        if (group.tabs.length === 0) {
          removeGroupAtPath(next, loc.groupPath);
          if (activeGroupIdRef.current === group.id) {
            activeGroupIdRef.current = null;
          }
        }
        const normalized = normalizeLayout(next);
        if (normalized.root && activeGroupIdRef.current) {
          if (!layoutContainsGroupId(normalized.root, activeGroupIdRef.current)) {
            const first = findFirstGroupPath(normalized.root);
            activeGroupIdRef.current = first?.group.id ?? null;
          }
        }
        if (!normalized.root) {
          activeGroupIdRef.current = null;
        }
        return normalized;
      });
    },
    [setLayout]
  );

  const focusPanelInternal = useCallback(
    (panelId: string) => {
      setLayout((prev) => {
        const next = cloneLayout(prev);
        const loc = findPanelInLayout(next, panelId);
        if (!loc) return prev;
        const group = getNodeAtPath(next.root, loc.groupPath);
        if (!isGroupNode(group)) return prev;
        group.active = panelId;
        activeGroupIdRef.current = group.id;
        return next;
      });
    },
    [setLayout]
  );

  const ensurePanelApi = useCallback(
    (panel: DockviewPanel): DockviewPanelApi => {
      const existing = panelApis.current.get(panel.id);
      if (existing) {
        existing.title = panel.title;
        existing.params = panel.params;
        return existing;
      }
      const api: DockviewPanelApi = {
        id: panel.id,
        title: panel.title,
        params: panel.params,
        setTitle(title) {
          setLayout((prev) => {
            const next = cloneLayout(prev);
            const loc = findPanelInLayout(next, panel.id);
            if (!loc) return prev;
            const group = getNodeAtPath(next.root, loc.groupPath);
            if (!isGroupNode(group)) return prev;
            const target = group.tabs[loc.panelIndex];
            if (!target) return prev;
            target.title = title;
            api.title = title;
            return next;
          });
        },
        updateParameters(parameters) {
          setLayout((prev) => {
            const next = cloneLayout(prev);
            const loc = findPanelInLayout(next, panel.id);
            if (!loc) return prev;
            const group = getNodeAtPath(next.root, loc.groupPath);
            if (!isGroupNode(group)) return prev;
            const target = group.tabs[loc.panelIndex];
            if (!target) return prev;
            if (!parameters || typeof parameters !== "object" || Array.isArray(parameters)) {
              target.params = parameters;
            } else {
              const current = { ...(target.params ?? {}) } as Record<string, any>;
              Object.entries(parameters).forEach(([key, value]) => {
                if (value === undefined) {
                  delete current[key];
                } else {
                  current[key] = value;
                }
              });
              target.params = current;
            }
            api.params = target.params;
            return next;
          });
        },
        focus() {
          focusPanelInternal(panel.id);
        },
        close() {
          panelApis.current.delete(panel.id);
          removePanel(panel.id);
        },
      };
      panelApis.current.set(panel.id, api);
      return api;
    },
    [removePanel, focusPanelInternal, setLayout]
  );

  const mutateInsert = useCallback(
    (
      layout: DockviewLayout,
      panel: DockviewPanel,
      target: DropTarget,
      preferredSize?: number
    ): string | null => {
      if (target.type === "group") {
        if (target.path.length === 0) {
          const existingRoot = layout.root;
          if (!existingRoot) {
            const newGroup: DockviewGroupNode = {
              type: "group",
              id: createId("group"),
              tabs: [panel],
              active: panel.id,
              size: preferredSize,
            };
            layout.root = newGroup;
            return newGroup.id;
          }
        }
        if (target.position === "center") {
          return insertPanelIntoGroup(layout, target.path, panel, target.tabIndex);
        }
        return insertPanelAsSplitNode(layout, target.path, target.position, panel, preferredSize);
      }
      return insertPanelIntoSplitNode(layout, target.path, target.index, panel, preferredSize);
    },
    []
  );

  const movePanel = useCallback(
    (panelId: string, target: DropTarget) => {
      const source = findPanel(panelId);
      if (!source) return;
      setLayout((prev) => {
        const next = cloneLayout(prev);
        const sourceGroup = getNodeAtPath(next.root, source.groupPath);
        if (!isGroupNode(sourceGroup)) return prev;
        const [panel] = sourceGroup.tabs.splice(source.panelIndex, 1);
        if (!panel) return prev;
        if (sourceGroup.active === panel.id) {
          ensureGroupActive(sourceGroup);
        }
        if (sourceGroup.tabs.length === 0) {
          removeGroupAtPath(next, source.groupPath);
          if (activeGroupIdRef.current === sourceGroup.id) {
            activeGroupIdRef.current = null;
          }
        }
        if (
          target.type === "group" &&
          target.position === "center" &&
          arraysEqual(source.groupPath, target.path) &&
          target.tabIndex !== undefined &&
          target.tabIndex > source.panelIndex
        ) {
          target = { ...target, tabIndex: target.tabIndex - 1 };
        }
        const targetGroupId = mutateInsert(next, panel, target);
        if (!targetGroupId) return prev;
        activeGroupIdRef.current = targetGroupId;
        const normalized = normalizeLayout(next);
        return normalized;
      });
      setDragOver(null);
    },
    [findPanel, mutateInsert, setLayout]
  );

  const addPanel = useCallback(
    (options: AddPanelOptions): DockviewPanelApi => {
      if (options.id) {
        const existing = findPanel(options.id);
        if (existing) {
          const group = getNodeAtPath(layoutRef.current.root, existing.groupPath);
          if (isGroupNode(group)) {
            const panel = group.tabs[existing.panelIndex];
            focusPanelInternal(panel.id);
            return ensurePanelApi(panel);
          }
        }
      }
      const panel: DockviewPanel = {
        id: options.id || createId("panel"),
        component: options.component,
        title: options.title,
        params: options.params,
      };

      const applyNewGroup = (group: DockviewGroupNode) => {
        setLayout(() => ({ root: group, version: "2" }));
        activeGroupIdRef.current = group.id;
      };

      if (!layoutRef.current.root) {
        const group: DockviewGroupNode = {
          type: "group",
          id: createId("group"),
          tabs: [panel],
          active: panel.id,
          size: options.size,
        };
        applyNewGroup(group);
        return ensurePanelApi(panel);
      }

      let target: DropTarget | null = null;

      if (options.position && "groupId" in options.position) {
        const path = findGroupPathById(layoutRef.current.root, options.position.groupId);
        if (path) {
          target = {
            type: "group",
            path,
            position: "center",
            tabIndex: options.position.index,
          };
        }
      } else if (options.position && "referencePanelId" in options.position) {
        const loc = findPanel(options.position.referencePanelId);
        if (loc) {
          const direction = options.position.direction || "center";
          if (direction === "center") {
            target = {
              type: "group",
              path: loc.groupPath,
              position: "center",
              tabIndex: loc.panelIndex + 1,
            };
          } else {
            target = {
              type: "group",
              path: loc.groupPath,
              position: direction,
            };
          }
        }
      }

      if (!target) {
        let path: number[] | null = null;
        if (activeGroupIdRef.current && layoutRef.current.root) {
          path = findGroupPathById(layoutRef.current.root, activeGroupIdRef.current);
        }
        if (!path && layoutRef.current.root) {
          const first = findFirstGroupPath(layoutRef.current.root);
          path = first ? first.path : null;
        }
        if (path) {
          target = { type: "group", path, position: "center" };
        }
      }

      if (!target) {
        const group: DockviewGroupNode = {
          type: "group",
          id: createId("group"),
          tabs: [panel],
          active: panel.id,
          size: options.size,
        };
        applyNewGroup(group);
        return ensurePanelApi(panel);
      }

      setLayout((prev) => {
        const next = cloneLayout(prev);
        const targetGroupId = mutateInsert(next, panel, target!, options.size);
        if (!targetGroupId) return prev;
        const normalized = normalizeLayout(next);
        activeGroupIdRef.current = targetGroupId;
        return normalized;
      });

      return ensurePanelApi(panel);
    },
    [ensurePanelApi, findPanel, focusPanelInternal, mutateInsert, setLayout]
  );

  const closePanel = useCallback(
    (panelId: string) => {
      panelApis.current.delete(panelId);
      removePanel(panelId);
    },
    [removePanel]
  );

  const getPanel = useCallback(
    (panelId: string): DockviewPanelApi | undefined => {
      const loc = findPanel(panelId);
      if (!loc) return undefined;
      const group = getNodeAtPath(layoutRef.current.root, loc.groupPath);
      if (!isGroupNode(group)) return undefined;
      const panel = group.tabs[loc.panelIndex];
      if (!panel) return undefined;
      return ensurePanelApi(panel);
    },
    [ensurePanelApi, findPanel]
  );

  const fromJSON = useCallback(
    (nextLayout: DockviewLayout | { groups?: DockviewGroup[] }) => {
      const map = componentsRef.current;
      let normalized: DockviewLayout;
      if (nextLayout && "root" in nextLayout) {
        const rootNode = normalizeImportedNode(nextLayout.root, map);
        normalized = normalizeLayout({ root: rootNode, version: "2" });
      } else {
        normalized = convertLegacyLayout(nextLayout, map);
      }
      setLayout(() => normalized);
      const first = normalized.root ? findFirstGroupPath(normalized.root) : null;
      activeGroupIdRef.current = first?.group.id ?? null;
      panelApis.current.clear();
    },
    [setLayout]
  );

  const toJSON = useCallback(() => cloneLayout(layoutRef.current), []);

  const api = useMemo<DockviewApi>(
    () => ({
      addPanel,
      closePanel,
      focusPanel: focusPanelInternal,
      getPanel,
      toJSON,
      fromJSON,
    }),
    [addPanel, closePanel, focusPanelInternal, fromJSON, getPanel, toJSON]
  );

  useEffect(() => {
    onReady?.({ api });
  }, [api, onReady]);

  const handleDragStart = (event: React.DragEvent<HTMLElement>, panelId: string) => {
    draggingIdRef.current = panelId;
    setIsDragging(true);
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = "move";
      try {
        event.dataTransfer.setData("text/plain", panelId);
      } catch {}
    }
  };

  const handleDragEnd = () => {
    draggingIdRef.current = null;
    setDragOver(null);
    setIsDragging(false);
  };

  const handleGroupDrop = (
    path: number[],
    position: GroupDropPosition,
    tabIndex?: number
  ) => {
    const draggingId = draggingIdRef.current;
    if (!draggingId) return;
    movePanel(draggingId, { type: "group", path, position, tabIndex });
  };

  const handleSplitDrop = (path: number[], index: number) => {
    const draggingId = draggingIdRef.current;
    if (!draggingId) return;
    movePanel(draggingId, { type: "split", path, index });
  };

  useEffect(() => {
    return () => {
      if (resizeCleanupRef.current) {
        resizeCleanupRef.current();
        resizeCleanupRef.current = null;
      }
    };
  }, []);

  const handleResizeStart = useCallback(
    (splitPath: number[], index: number, orientation: "horizontal" | "vertical", event: React.PointerEvent<HTMLButtonElement>) => {
      event.preventDefault();
      const splitKey = pathToKey(splitPath);
      const target = event.currentTarget;
      const container = target.closest(`[data-split-path="${splitKey}"]`) as HTMLElement | null;
      const splitNode = getNodeAtPath(layoutRef.current.root, splitPath);
      if (!container || !isSplitNode(splitNode)) return;
      const childElements = Array.from(
        container.querySelectorAll<HTMLElement>(":scope > .dv-node")
      );
      if (childElements.length <= index || childElements.length <= index + 1) return;
      const prevEl = childElements[index];
      const nextEl = childElements[index + 1];
      const prevRect = prevEl.getBoundingClientRect();
      const nextRect = nextEl.getBoundingClientRect();
      const prevSizePx = orientation === "horizontal" ? prevRect.width : prevRect.height;
      const nextSizePx = orientation === "horizontal" ? nextRect.width : nextRect.height;
      if (prevSizePx <= 0 || nextSizePx <= 0) return;
      const startPos = orientation === "horizontal" ? event.clientX : event.clientY;
      const minSize = 60;
      const prevWeight = splitNode.children[index]?.size ?? 1;
      const nextWeight = splitNode.children[index + 1]?.size ?? 1;
      const totalWeight = prevWeight + nextWeight;

      const handleMove = (moveEvent: PointerEvent) => {
        const currentPos = orientation === "horizontal" ? moveEvent.clientX : moveEvent.clientY;
        const delta = currentPos - startPos;
        let newPrevPx = prevSizePx + delta;
        let newNextPx = nextSizePx - delta;
        const totalPx = prevSizePx + nextSizePx;
        if (newPrevPx < minSize) {
          newPrevPx = minSize;
          newNextPx = totalPx - minSize;
        } else if (newNextPx < minSize) {
          newNextPx = minSize;
          newPrevPx = totalPx - minSize;
        }
        if (newPrevPx <= 0 || newNextPx <= 0) return;
        const ratio = newPrevPx / (newPrevPx + newNextPx);
        const newPrevWeight = totalWeight * ratio;
        const newNextWeight = totalWeight - newPrevWeight;
        setLayout((prevLayout) => {
          const updated = cloneLayout(prevLayout);
          const split = getNodeAtPath(updated.root, splitPath);
          if (!isSplitNode(split)) return prevLayout;
          if (!split.children[index] || !split.children[index + 1]) return prevLayout;
          split.children[index].size = newPrevWeight;
          split.children[index + 1].size = newNextWeight;
          return updated;
        });
      };

      const handleUp = () => {
        if (resizeCleanupRef.current) {
          resizeCleanupRef.current();
          resizeCleanupRef.current = null;
        }
        setResizingHandle(null);
      };

      window.addEventListener("pointermove", handleMove);
      window.addEventListener("pointerup", handleUp, { once: true });
      resizeCleanupRef.current = () => {
        window.removeEventListener("pointermove", handleMove);
        window.removeEventListener("pointerup", handleUp);
      };
      setResizingHandle(`${splitKey}:${index}`);
    },
    [setLayout]
  );

  const renderGroup = useCallback(
    (group: DockviewGroupNode, path: number[]) => {
      ensureGroupActive(group);
      const activePanel = group.tabs.find((tab) => tab.id === group.active);
      const groupKey = group.id;
      const dropTargets: Array<{ position: GroupDropPosition; className: string }> = [
        { position: "center", className: "dv-drop-target-center" },
        { position: "left", className: "dv-drop-target-left" },
        { position: "right", className: "dv-drop-target-right" },
        { position: "top", className: "dv-drop-target-top" },
        { position: "bottom", className: "dv-drop-target-bottom" },
      ];
      return (
        <div
          key={groupKey}
          className="dv-group"
          data-group-id={group.id}
          onDragOver={(e) => {
            if (!draggingIdRef.current) return;
            e.preventDefault();
            e.stopPropagation();
          }}
          onDrop={(e) => {
            if (!draggingIdRef.current) return;
            e.preventDefault();
            e.stopPropagation();
            handleGroupDrop(path, "center");
          }}
        >
          {isDragging &&
            dropTargets.map(({ position, className }) => (
              <div
                key={position}
                className={[
                  "dv-drop-target",
                  className,
                  isDragging ? "dv-drop-target-enabled" : "",
                  dragOver === `group:${group.id}:${position}` ? "dv-drop-target-active" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                onDragOver={(e) => {
                  if (!draggingIdRef.current) return;
                  e.preventDefault();
                  e.stopPropagation();
                  setDragOver(`group:${group.id}:${position}`);
                }}
                onDragLeave={() => {
                  setDragOver((prev) => (prev === `group:${group.id}:${position}` ? null : prev));
                }}
                onDrop={(e) => {
                  if (!draggingIdRef.current) return;
                  e.preventDefault();
                  e.stopPropagation();
                  handleGroupDrop(path, position);
                  setDragOver(null);
                }}
              />
            ))}
          <div className="dv-tabs">
            {group.tabs.map((tab, tabIndex) => {
              ensurePanelApi(tab);
              const isActive = tab.id === activePanel?.id;
              const tabKey = `tab:${group.id}:${tab.id}`;
              return (
                <div
                  key={tab.id}
                  role="tab"
                  aria-selected={isActive}
                  tabIndex={0}
                  className={["dv-tab", isActive ? "dv-tab-active" : ""].join(" ").trim()}
                  draggable
                  onDragStart={(event) => handleDragStart(event, tab.id)}
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
                    e.stopPropagation();
                    setDragOver(tabKey);
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const draggingId = draggingIdRef.current;
                    if (!draggingId || draggingId === tab.id) return;
                    handleGroupDrop(path, "center", tabIndex);
                    setDragOver(null);
                  }}
                  data-drop-active={dragOver === tabKey}
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
                    return <div className="dv-empty">Unknown component: {activePanel.component}</div>;
                  }
                  const api = ensurePanelApi(activePanel);
                  return <Component params={activePanel.params} api={api} />;
                })()}
              </div>
            ) : (
              <div className="dv-empty">Drop a panel here</div>
            )}
          </div>
        </div>
      );
    },
    [
      closePanel,
      components,
      ensurePanelApi,
      focusPanelInternal,
      handleDragEnd,
      handleDragStart,
      handleGroupDrop,
      isDragging,
      setDragOver,
      dragOver,
    ]
  );

  const renderNode = useCallback(
    (node: DockviewNode, path: number[] = []) => {
      if (isGroupNode(node)) {
        return renderGroup(node, path);
      }
      const orientationClass = node.orientation === "vertical" ? "dv-split-vertical" : "dv-split-horizontal";
      const splitKey = pathToKey(path);
      return (
        <div
          key={node.id}
          className={["dv-split", orientationClass].join(" ").trim()}
          data-split-path={splitKey}
        >
          {node.children.map((child, index) => {
            const beforeKey = `split:${splitKey}:${index}`;
            const childPath = [...path, index];
            return (
              <React.Fragment key={child.id}>
                <div
                  className={[
                    "dv-drop-zone",
                    node.orientation === "vertical" ? "dv-drop-zone-row" : "dv-drop-zone-column",
                    dragOver === beforeKey ? "dv-drop-active" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  onDragOver={(e) => {
                    if (!draggingIdRef.current) return;
                    e.preventDefault();
                    e.stopPropagation();
                    setDragOver(beforeKey);
                  }}
                  onDragLeave={() => {
                    setDragOver((prev) => (prev === beforeKey ? null : prev));
                  }}
                  onDrop={(e) => {
                    if (!draggingIdRef.current) return;
                    e.preventDefault();
                    e.stopPropagation();
                    handleSplitDrop(path, index);
                    setDragOver(null);
                  }}
                />
                <div className="dv-node" style={{ flexGrow: child.size ?? 1, flexBasis: 0 }}>
                  {renderNode(child, childPath)}
                </div>
                {index === node.children.length - 1 && (
                  <div
                    className={[
                      "dv-drop-zone",
                      node.orientation === "vertical" ? "dv-drop-zone-row" : "dv-drop-zone-column",
                      dragOver === `split:${splitKey}:${index + 1}` ? "dv-drop-active" : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    onDragOver={(e) => {
                      if (!draggingIdRef.current) return;
                      e.preventDefault();
                      e.stopPropagation();
                      setDragOver(`split:${splitKey}:${index + 1}`);
                    }}
                    onDragLeave={() => {
                      setDragOver((prev) => (prev === `split:${splitKey}:${index + 1}` ? null : prev));
                    }}
                    onDrop={(e) => {
                      if (!draggingIdRef.current) return;
                      e.preventDefault();
                      e.stopPropagation();
                      handleSplitDrop(path, index + 1);
                      setDragOver(null);
                    }}
                  />
                )}
                {index < node.children.length - 1 && (
                  <div
                    className={["dv-splitter", node.orientation === "vertical" ? "dv-splitter-vertical" : ""].join(" ")}
                  >
                    <div
                      className={[
                        "dv-drop-zone",
                        node.orientation === "vertical" ? "dv-drop-zone-row" : "dv-drop-zone-column",
                        dragOver === `split:${splitKey}:between:${index}` ? "dv-drop-active" : "",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                      onDragOver={(e) => {
                        if (!draggingIdRef.current) return;
                        e.preventDefault();
                        e.stopPropagation();
                        setDragOver(`split:${splitKey}:between:${index}`);
                      }}
                      onDragLeave={() => {
                        setDragOver((prev) => (prev === `split:${splitKey}:between:${index}` ? null : prev));
                      }}
                      onDrop={(e) => {
                        if (!draggingIdRef.current) return;
                        e.preventDefault();
                        e.stopPropagation();
                        handleSplitDrop(path, index + 1);
                        setDragOver(null);
                      }}
                    />
                    <button
                      type="button"
                      aria-label="Resize panels"
                      className={[
                        "dv-resize-handle",
                        node.orientation === "vertical" ? "dv-resize-handle-vertical" : "",
                        resizingHandle === `${splitKey}:${index}` ? "dv-resize-active" : "",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                      onPointerDown={(e) => handleResizeStart(path, index, node.orientation, e)}
                    >
                      <span className="dv-resize-grip" />
                    </button>
                  </div>
                )}
              </React.Fragment>
            );
          })}
        </div>
      );
    },
    [dragOver, handleResizeStart, handleSplitDrop, renderGroup, resizingHandle, setDragOver]
  );

  const handleEmptyDrop = (event: React.DragEvent<HTMLDivElement>) => {
    if (!draggingIdRef.current) return;
    event.preventDefault();
    movePanel(draggingIdRef.current, { type: "group", path: [], position: "center" });
  };

  return (
    <div
      ref={containerRef}
      className={["dv-root", className ?? ""].join(" ").trim()}
      style={style}
      onDragOver={(e) => {
        if (!draggingIdRef.current) return;
        e.preventDefault();
        if (!layout.root) {
          setDragOver("root");
        }
      }}
      onDrop={(e) => {
        if (!draggingIdRef.current || layout.root) return;
        handleEmptyDrop(e);
        setDragOver(null);
      }}
    >
      {layout.root ? (
        <div className="dv-node" style={{ flexGrow: layout.root.size ?? 1, flexBasis: 0 }}>
          {renderNode(layout.root, [])}
        </div>
      ) : (
        <div className="dv-empty dv-empty-root" data-drop-active={dragOver === "root"}>
          Drop a panel to get started
        </div>
      )}
    </div>
  );
};

export const extractLayoutPanelIds = (layout: DockviewLayout): string[] => {
  const result: string[] = [];
  collectPanelIds(layout.root, result);
  return result;
};
