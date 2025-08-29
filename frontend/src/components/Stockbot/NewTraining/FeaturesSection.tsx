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
      <div className="grid md:grid-cols-3 gap-4">
        <div className="col-span-full md:col-span-1 flex items-center justify-between rounded border p-3">
          <Label className="mr-4">Use Custom Pipeline</Label>
          <Switch checked={useCustomPipeline} onCheckedChange={setUseCustomPipeline} />
        </div>
        <div className="space-y-2">
          <Label>Feature Window</Label>
          <Input type="number" value={featureWindow} onChange={(e) => setFeatureWindow(safeNum(e.target.value, featureWindow))} />
        </div>
        <div className="space-y-2 md:col-span-2">
          <Label>Indicators (comma separated)</Label>
          <Input value={indicators} onChange={(e) => setIndicators(e.target.value)} placeholder="logret,rsi14,vol20,macd,bb_upper,bb_lower" />
        </div>
      </div>
    </section>
  );
}

