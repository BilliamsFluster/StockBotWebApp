import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import type { RunArtifacts } from "../lib/types";
import { TooltipLabel } from "../shared/TooltipLabel";

interface DownloadsProps {
  includeModel: boolean;
  setIncludeModel: (v: boolean) => void;
  bundleHref?: string;
  artifacts: RunArtifacts | null;
}

export function DownloadsSection({
  includeModel,
  setIncludeModel,
  bundleHref,
  artifacts,
}: DownloadsProps) {
  return (
    <section className="rounded-xl border p-4 space-y-3">
      <div className="font-medium">Downloads</div>
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <Switch checked={includeModel} onCheckedChange={setIncludeModel} id="include-model" />
          <TooltipLabel
            htmlFor="include-model"
            className="text-sm"
            tooltip="Include trained policy weights in the downloadable bundle. Increases file size."
          >
            Include model (.zip) in bundle
          </TooltipLabel>
        </div>
        {bundleHref && (
          <a className="underline" href={bundleHref} target="_blank" rel="noreferrer">
            <Button>Download Bundle (.zip)</Button>
          </a>
        )}
      </div>

      {artifacts && (
        <div className="flex flex-wrap gap-3 text-sm">
          {artifacts.metrics && (
            <a className="underline" href={artifacts.metrics} target="_blank" rel="noreferrer">
              metrics.json
            </a>
          )}
          {artifacts.summary && (
            <a className="underline" href={artifacts.summary} target="_blank" rel="noreferrer">
              summary.json
            </a>
          )}
          {artifacts.equity && (
            <a className="underline" href={artifacts.equity} target="_blank" rel="noreferrer">
              equity.csv
            </a>
          )}
          {artifacts.orders && (
            <a className="underline" href={artifacts.orders} target="_blank" rel="noreferrer">
              orders.csv
            </a>
          )}
          {artifacts.trades && (
            <a className="underline" href={artifacts.trades} target="_blank" rel="noreferrer">
              trades.csv
            </a>
          )}
          {artifacts.cv_report && (
            <a className="underline" href={artifacts.cv_report} target="_blank" rel="noreferrer">
              cv_report.json
            </a>
          )}
          {artifacts.stress_report && (
            <a className="underline" href={artifacts.stress_report} target="_blank" rel="noreferrer">
              stress_report.json
            </a>
          )}
          {artifacts.config && (
            <a className="underline" href={artifacts.config} target="_blank" rel="noreferrer">
              config.snapshot.yaml
            </a>
          )}
            {artifacts.model && (
              <a className="underline" href={artifacts.model} target="_blank" rel="noreferrer">
                ppo_policy.zip
              </a>
            )}
            {artifacts.job_log && (
              <a className="underline" href={artifacts.job_log} target="_blank" rel="noreferrer">
                job.log
              </a>
            )}
            {artifacts.payload && (
              <a className="underline" href={artifacts.payload} target="_blank" rel="noreferrer">
                payload.json
              </a>
            )}
          </div>
        )}
      </section>
    );
  }

