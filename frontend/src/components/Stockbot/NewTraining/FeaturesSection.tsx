"use client";

import { AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { TooltipLabel } from "../shared/TooltipLabel";

interface FeaturesProps {
  featureSet: string[];
  setFeatureSet: (v: string[]) => void;
  rsi: boolean;
  setRsi: (v: boolean) => void;
  macd: boolean;
  setMacd: (v: boolean) => void;
  bbands: boolean;
  setBbands: (v: boolean) => void;
  normalize: boolean;
  setNormalize: (v: boolean) => void;
  embargo: number;
  setEmbargo: (v: number) => void;
  dataSource: "yfinance" | "cached" | "auto";
  setDataSource: (v: "yfinance" | "cached" | "auto") => void;
}

export function FeaturesSection({
  featureSet,
  setFeatureSet,
  rsi,
  setRsi,
  macd,
  setMacd,
  bbands,
  setBbands,
  normalize,
  setNormalize,
  embargo,
  setEmbargo,
  dataSource,
  setDataSource,
}: FeaturesProps) {
  const toggleSet = (item: string) => {
    if (featureSet.includes(item)) {
      setFeatureSet(featureSet.filter((s) => s !== item));
    } else {
      setFeatureSet([...featureSet, item]);
    }
  };

  return (
    <AccordionItem value="features">
      <AccordionTrigger>Features</AccordionTrigger>
      <AccordionContent>
        <div className="space-y-4 pt-2">
          <div className="space-y-2">
            <TooltipLabel tooltip="Select which built-in feature sets to include">Feature Set</TooltipLabel>
            <div className="flex gap-4 flex-wrap">
              {[
                { id: "ohlcv", label: "ohlcv" },
                { id: "ohlcv_ta_basic", label: "ohlcv_ta_basic" },
                { id: "ohlcv_ta_rich", label: "ohlcv_ta_rich" },
                { id: "minimal", label: "minimal (recommended core)" },
              ].map((opt) => (
                <label key={opt.id} className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={featureSet.includes(opt.id)}
                    onCheckedChange={() => toggleSet(opt.id)}
                  />
                  {opt.label}
                </label>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap gap-6">
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={rsi} onCheckedChange={setRsi} /> RSI
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={macd} onCheckedChange={setMacd} /> MACD
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={bbands} onCheckedChange={setBbands} /> BBands
            </label>
          </div>

          <div className="flex items-center gap-4">
            <Switch checked={normalize} onCheckedChange={setNormalize} />
            <TooltipLabel tooltip="Normalize observations using running stats">Normalize Obs</TooltipLabel>
          </div>

          <div className="flex items-center gap-2">
            <TooltipLabel tooltip="Bars to embargo around events" className="min-w-[160px]">
              Embargo Bars
            </TooltipLabel>
            <Input
              type="number"
              value={embargo}
              onChange={(e) => setEmbargo(parseInt(e.target.value) || embargo)}
            />
          </div>

          <div className="flex items-center gap-2">
            <TooltipLabel tooltip="Where to source market data for training" className="min-w-[160px]">
              Data Source
            </TooltipLabel>
            <select
              className="border rounded px-2 py-1 text-sm"
              value={dataSource}
              onChange={(e) => setDataSource(e.target.value as any)}
            >
              <option value="yfinance">yfinance (live fetch)</option>
              <option value="cached">cached (prepared windows)</option>
              <option value="auto">auto (prefer cached)</option>
            </select>
          </div>
        </div>
      </AccordionContent>
    </AccordionItem>
  );
}
