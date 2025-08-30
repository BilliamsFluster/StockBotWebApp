import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { safeNum } from "./utils";
import { TooltipLabel } from "../shared/TooltipLabel";

interface FeaturesProps {
  useCustomPipeline: boolean;
  setUseCustomPipeline: (v: boolean) => void;
  featureWindow: number;
  setFeatureWindow: (v: number) => void;
  indicators: string;
  setIndicators: (v: string) => void;
}

export function FeaturesSection({
  useCustomPipeline,
  setUseCustomPipeline,
  featureWindow,
  setFeatureWindow,
  indicators,
  setIndicators,
}: FeaturesProps) {
  return (
    <section className="rounded-xl border p-4">
      <div className="font-medium mb-4">Features</div>
      <div className="grid md:grid-cols-2 gap-3">
        <div className="col-span-full flex items-center gap-2 rounded border p-2">
          <TooltipLabel className="min-w-[160px]" tooltip="Enable custom feature pipeline">
            Use Custom Pipeline
          </TooltipLabel>
          <Switch checked={useCustomPipeline} onCheckedChange={setUseCustomPipeline} />
        </div>
        <div className="flex items-center gap-2">
          <TooltipLabel className="min-w-[160px]" tooltip="Number of periods used for each feature">
            Feature Window
          </TooltipLabel>
          <Input
            type="number"
            value={featureWindow}
            onChange={(e) => setFeatureWindow(safeNum(e.target.value, featureWindow))}
            className="flex-1"
          />
        </div>
        <div className="flex items-center gap-2 col-span-full">
          <TooltipLabel className="min-w-[160px]" tooltip="Comma-separated technical indicators">
            Indicators
          </TooltipLabel>
          <Input
            value={indicators}
            onChange={(e) => setIndicators(e.target.value)}
            placeholder="logret,rsi14,vol20,macd,bb_upper,bb_lower"
            className="flex-1"
          />
        </div>
      </div>
    </section>
  );
}

