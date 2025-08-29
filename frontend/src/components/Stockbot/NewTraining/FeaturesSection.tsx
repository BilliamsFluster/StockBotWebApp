import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { safeNum } from "./utils";

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
          <Label className="min-w-[160px]">Use Custom Pipeline</Label>
          <Switch checked={useCustomPipeline} onCheckedChange={setUseCustomPipeline} />
        </div>
        <div className="flex items-center gap-2">
          <Label className="min-w-[160px]">Feature Window</Label>
          <Input
            type="number"
            value={featureWindow}
            onChange={(e) => setFeatureWindow(safeNum(e.target.value, featureWindow))}
            className="flex-1"
          />
        </div>
        <div className="flex items-center gap-2 col-span-full">
          <Label className="min-w-[160px]">Indicators</Label>
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

