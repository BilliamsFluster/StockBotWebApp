import {
  type Dispatch,
  type SetStateAction,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { toast } from "react-hot-toast";
import api, { buildUrl } from "@/api/client";
import type { JobStatusResponse, RunArtifacts } from "../lib/types";

export const TERMINAL_STATUSES: Array<JobStatusResponse["status"]> = [
  "SUCCEEDED",
  "FAILED",
  "CANCELLED",
];

interface UseTrainingRunResult {
  jobId: string | null;
  status: JobStatusResponse | null;
  artifacts: RunArtifacts | null;
  progress: string | null;
  setProgress: Dispatch<SetStateAction<string | null>>;
  beginRun: (jobId: string) => void;
  reset: () => void;
  cancelRun: () => Promise<void>;
  includeModel: boolean;
  setIncludeModel: Dispatch<SetStateAction<boolean>>;
  isRunning: boolean;
}

export function useTrainingRun(): UseTrainingRunResult {
  const [jobId, setJobId] = useState<string | null>(null);
  const [status, setStatus] = useState<JobStatusResponse | null>(null);
  const [artifacts, setArtifacts] = useState<RunArtifacts | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const [includeModel, setIncludeModel] = useState(true);
  const toastRef = useRef<string | null>(null);

  useEffect(() => {
    return () => {
      if (toastRef.current) {
        toast.dismiss(toastRef.current);
        toastRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!progress) return;
    if (progress.toLowerCase().startsWith("submitting")) {
      toastRef.current = toast.loading("Submitting training…", {
        id: toastRef.current ?? undefined,
        duration: Infinity,
      });
    }
  }, [progress]);

  useEffect(() => {
    if (!jobId) return;
    toastRef.current = toast.loading(`Queued ${jobId}`, {
      id: toastRef.current ?? undefined,
      duration: Infinity,
    });
  }, [jobId]);

  useEffect(() => {
    if (!jobId || !status) return;
    const st = status.status;
    if (st === "RUNNING") {
      toastRef.current = toast.loading(`Training ${jobId} running…`, {
        id: toastRef.current ?? undefined,
        duration: Infinity,
      });
    }
    if (TERMINAL_STATUSES.includes(st)) {
      if (st === "SUCCEEDED") {
        toast.success(`Training ${jobId} completed`, {
          id: toastRef.current ?? undefined,
          duration: 4000,
        });
      } else if (st === "FAILED") {
        toast.error(`Training ${jobId} failed`, {
          id: toastRef.current ?? undefined,
          duration: 6000,
        });
      } else {
        toast(`Training ${jobId} cancelled`, {
          id: toastRef.current ?? undefined,
          duration: 4000,
        });
      }
      toastRef.current = null;
    }
  }, [status, jobId]);

  useEffect(() => {
    if (!jobId) return;
    let timer: ReturnType<typeof setTimeout>;
    let delay = 5000;
    let running = true;
    let busy = false;
    let es: EventSource | null = null;
    let ws: WebSocket | null = null;

    const schedule = (ms: number) => {
      if (!running) return;
      clearTimeout(timer);
      timer = setTimeout(tick, ms);
    };

    const tick = async () => {
      if (!running || busy) return schedule(delay);
      busy = true;
      try {
        const { data: st } = await api.get<JobStatusResponse>(`/stockbot/runs/${jobId}`);
        setStatus(st);
        if (TERMINAL_STATUSES.includes(st.status)) {
          setProgress(st.status === "SUCCEEDED" ? "Run complete." : `Run ${st.status.toLowerCase()}.`);
          try {
            const { data: a } = await api.get<RunArtifacts>(`/stockbot/runs/${jobId}/artifacts`);
            setArtifacts(a);
          } catch {}
          running = false;
          return;
        }
        delay = 5000;
        schedule(delay);
      } catch {
        delay = Math.min(delay * 1.7, 60000);
        schedule(delay);
      } finally {
        busy = false;
      }
    };

    try {
      const url = buildUrl(`/api/stockbot/runs/${jobId}/stream`);
      es = new EventSource(url, { withCredentials: true });
      es.onmessage = (ev) => {
        try {
          const st = JSON.parse(ev.data) as JobStatusResponse;
          setStatus(st);
          if (TERMINAL_STATUSES.includes(st.status)) {
            setProgress(st.status === "SUCCEEDED" ? "Run complete." : `Run ${st.status.toLowerCase()}.`);
            (async () => {
              try {
                const { data: a } = await api.get<RunArtifacts>(`/stockbot/runs/${jobId}/artifacts`);
                setArtifacts(a);
              } catch {}
            })();
            es && es.close();
            running = false;
          }
        } catch {}
      };
      es.onerror = () => {
        try {
          es && es.close();
        } catch {}
        const wsUrl = buildUrl(`/api/stockbot/runs/${jobId}/ws`).replace(/^http/, "ws");
        if (/:5001\//.test(wsUrl)) {
          schedule(0);
          return;
        }
        try {
          ws = new WebSocket(wsUrl);
          ws.onmessage = (ev) => {
            try {
              const st = JSON.parse(ev.data) as JobStatusResponse;
              setStatus(st);
              if (TERMINAL_STATUSES.includes(st.status)) {
                setProgress(st.status === "SUCCEEDED" ? "Run complete." : `Run ${st.status.toLowerCase()}.`);
                (async () => {
                  try {
                    const { data: a } = await api.get<RunArtifacts>(`/stockbot/runs/${jobId}/artifacts`);
                    setArtifacts(a);
                  } catch {}
                })();
                try {
                  ws && ws.close();
                } catch {}
                running = false;
              }
            } catch {}
          };
          ws.onerror = () => {
            try {
              ws && ws.close();
            } catch {}
            schedule(0);
          };
        } catch {
          schedule(0);
        }
      };
    } catch {
      schedule(0);
    }

    return () => {
      running = false;
      clearTimeout(timer);
      try {
        es && es.close();
      } catch {}
      try {
        ws && ws.close();
      } catch {}
    };
  }, [jobId]);

  const cancelRun = useCallback(async () => {
    if (!jobId) return;
    try {
      await api.post(`/stockbot/runs/${jobId}/cancel`);
      toast(`Training ${jobId} cancelled`, {
        id: toastRef.current ?? undefined,
        duration: 4000,
      });
      toastRef.current = null;
    } catch {}
  }, [jobId]);

  const reset = useCallback(() => {
    setJobId(null);
    setStatus(null);
    setArtifacts(null);
    setProgress(null);
  }, []);

  const beginRun = useCallback(
    (id: string) => {
      setJobId(id);
      setStatus(null);
      setArtifacts(null);
    },
    []
  );

  const isRunning = useMemo(
    () => !!status && !TERMINAL_STATUSES.includes(status.status),
    [status]
  );

  return {
    jobId,
    status,
    artifacts,
    progress,
    setProgress,
    beginRun,
    reset,
    cancelRun,
    includeModel,
    setIncludeModel,
    isRunning,
  };
}
