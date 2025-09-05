import { AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Input } from "@/components/ui/input";
import { TooltipLabel } from "../shared/TooltipLabel";

interface Props {
  nFolds: number;
  setNFolds: (v: number) => void;
  embargo: number;
  setEmbargo: (v: number) => void;
}

export function CVStressSection({ nFolds, setNFolds, embargo, setEmbargo }: Props) {
  return (
    <AccordionItem value="cv">
      <AccordionTrigger>Cross-Validation & Stress</AccordionTrigger>
      <AccordionContent>
        <div className="grid md:grid-cols-2 gap-3 pt-2">
          <div className="flex items-center gap-2">
            <TooltipLabel className="min-w-[140px]" tooltip="Number of walk-forward folds">
              n_folds
            </TooltipLabel>
            <Input
              type="number"
              value={nFolds}
              onChange={(e) => setNFolds(parseInt(e.target.value) || nFolds)}
              className="flex-1"
            />
          </div>
          <div className="flex items-center gap-2">
            <TooltipLabel className="min-w-[140px]" tooltip="Embargo bars between folds">
              embargo_bars
            </TooltipLabel>
            <Input
              type="number"
              value={embargo}
              onChange={(e) => setEmbargo(parseInt(e.target.value) || embargo)}
              className="flex-1"
            />
          </div>
        </div>
      </AccordionContent>
    </AccordionItem>
  );
}
