import { AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { TooltipLabel } from "../shared/TooltipLabel";

interface Props {
  enabled: boolean;
  setEnabled: (v: boolean) => void;
  nStates: number;
  setNStates: (v: number) => void;
  features: string;
  setFeatures: (v: string) => void;
  append: boolean;
  setAppend: (v: boolean) => void;
}

export function RegimeSection({ enabled, setEnabled, nStates, setNStates, features, setFeatures, append, setAppend }: Props) {
  return (
    <AccordionItem value="regime">
      <AccordionTrigger>Regime (HMM)</AccordionTrigger>
      <AccordionContent>
        <div className="space-y-4 pt-2">
          <div className="flex items-center gap-4">
            <Switch checked={enabled} onCheckedChange={setEnabled} />
            <TooltipLabel tooltip="Enable regime hidden Markov model">Enabled</TooltipLabel>
          </div>
          <div className="flex items-center gap-2">
            <TooltipLabel className="min-w-[120px]" tooltip="Number of hidden states">
              n_states
            </TooltipLabel>
            <Input
              type="number"
              value={nStates}
              onChange={(e) => setNStates(parseInt(e.target.value) || nStates)}
              className="flex-1"
            />
          </div>
          <div className="flex items-center gap-2">
            <TooltipLabel className="min-w-[120px]" tooltip="Features for regime detection (comma separated)">
              features
            </TooltipLabel>
            <Input value={features} onChange={(e) => setFeatures(e.target.value)} className="flex-1" />
          </div>
          <div className="flex items-center gap-4">
            <Switch checked={append} onCheckedChange={setAppend} />
            <TooltipLabel tooltip="Append regime beliefs to observation">Append beliefs to obs</TooltipLabel>
          </div>
        </div>
      </AccordionContent>
    </AccordionItem>
  );
}
