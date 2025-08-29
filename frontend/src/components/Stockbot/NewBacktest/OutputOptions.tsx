import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

interface OutputOptionsProps {
  outTag: string;
  setOutTag: (v: string) => void;
  normalize: boolean;
  setNormalize: (v: boolean) => void;
}

export function OutputOptionsSection({
  outTag,
  setOutTag,
  normalize,
  setNormalize,
}: OutputOptionsProps) {
  return (
    <section className="rounded-xl border p-4">
      <div className="font-medium mb-4">Output & Options</div>
      <div className="grid md:grid-cols-3 gap-4">
        <InputGroup
          label="Run Tag"
          value={outTag}
          onChange={setOutTag}
        />
        <SwitchGroup
          label="Normalize (eval)"
          checked={normalize}
          onChange={setNormalize}
        />
      </div>
    </section>
  );
}

interface InputGroupProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
}

function InputGroup({ label, value, onChange }: InputGroupProps) {
  return (
    <div className="flex flex-col gap-1">
      <Label className="text-sm font-medium">{label}</Label>
      <Input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full"
      />
    </div>
  );
}

interface SwitchGroupProps {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}

function SwitchGroup({ label, checked, onChange }: SwitchGroupProps) {
  return (
    <div className="flex flex-col gap-1">
      <Label className="text-sm font-medium">{label}</Label>
      <div className="rounded border px-3 py-2 flex justify-between items-center">
        <span className="text-sm text-muted-foreground">Toggle</span>
        <Switch checked={checked} onCheckedChange={onChange} />
      </div>
    </div>
  );
}
