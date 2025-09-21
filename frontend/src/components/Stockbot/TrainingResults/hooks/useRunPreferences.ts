import { useEffect, useState } from "react";

export function useRunPreferences(runId?: string) {
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [visibleSelected, setVisibleSelected] = useState<Record<string, boolean>>({});
  const [showRollout, setShowRollout] = useState(true);
  const [showOptim, setShowOptim] = useState(true);
  const [showTiming, setShowTiming] = useState(false);
  const [showGrads, setShowGrads] = useState(true);
  const [showDistributions, setShowDistributions] = useState(false);

  useEffect(() => {
    if (!runId) return;
    try {
      const raw = localStorage.getItem(`trainingResults:prefs:${runId}`);
      if (!raw) return;
      const prefs = JSON.parse(raw);
      if (Array.isArray(prefs.selectedTags)) setSelectedTags(prefs.selectedTags);
      if (prefs.visibleSelected && typeof prefs.visibleSelected === "object") setVisibleSelected(prefs.visibleSelected);
      if (typeof prefs.showRollout === "boolean") setShowRollout(prefs.showRollout);
      if (typeof prefs.showOptim === "boolean") setShowOptim(prefs.showOptim);
      if (typeof prefs.showTiming === "boolean") setShowTiming(prefs.showTiming);
      if (typeof prefs.showGrads === "boolean") setShowGrads(prefs.showGrads);
      if (typeof prefs.showDists === "boolean") setShowDistributions(prefs.showDists);
    } catch {}
  }, [runId]);

  useEffect(() => {
    if (!runId) return;
    const timer = setTimeout(() => {
      try {
        const body = {
          selectedTags,
          visibleSelected,
          showRollout,
          showOptim,
          showTiming,
          showGrads,
          showDists: showDistributions,
        };
        localStorage.setItem(`trainingResults:prefs:${runId}`, JSON.stringify(body));
      } catch {}
    }, 300);
    return () => clearTimeout(timer);
  }, [runId, selectedTags, visibleSelected, showRollout, showOptim, showTiming, showGrads, showDistributions]);

  return {
    selectedTags,
    setSelectedTags,
    visibleSelected,
    setVisibleSelected,
    showRollout,
    setShowRollout,
    showOptim,
    setShowOptim,
    showTiming,
    setShowTiming,
    showGrads,
    setShowGrads,
    showDistributions,
    setShowDistributions,
  } as const;
}
