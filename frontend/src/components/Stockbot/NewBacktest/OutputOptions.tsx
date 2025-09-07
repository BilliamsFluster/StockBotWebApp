import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { TooltipLabel } from "../shared/TooltipLabel";

interface OutputOptionsProps {
  normalize: boolean;
  setNormalize: (v: boolean) => void;
}

export function OutputOptionsSection({ normalize, setNormalize }: OutputOptionsProps) {
  return (
    <section className="rounded-xl border p-4">
      <div className="font-medium mb-4">Output & Options</div>
      <div className="grid md:grid-cols-3 gap-4">
        <SwitchGroup
          label="Normalize (eval)"
          tooltip="Apply normalization when evaluating results"
          checked={normalize}
          onChange={setNormalize}
        />
      </div>
    </section>
  );
}

// Removed Run Tag input to avoid requiring explicit output directories

interface SwitchGroupProps {
  label: string;
  tooltip: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}

function SwitchGroup({ label, tooltip, checked, onChange }: SwitchGroupProps) {
  return (
    <div className="flex flex-col gap-1">
      <TooltipLabel tooltip={tooltip}>{label}</TooltipLabel>
      <div className="rounded border px-3 py-2 flex justify-between items-center">
        <span className="text-sm text-muted-foreground">Toggle</span>
        <Switch checked={checked} onCheckedChange={onChange} />
      </div>
    </div>
  );
}
