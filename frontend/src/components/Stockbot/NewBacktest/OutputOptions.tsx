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
        <div className="space-y-2">
          <Label>Run Tag</Label>
          <Input value={outTag} onChange={(e) => setOutTag(e.target.value)} />
        </div>
        <div className="col-span-full md:col-span-1 flex items-center justify-between rounded border p-3">
          <Label className="mr-4">Normalize (eval)</Label>
          <Switch checked={normalize} onCheckedChange={setNormalize} />
        </div>
      </div>
    </section>
  );
}

