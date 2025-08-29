import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Button } from "@/components/ui/button";

interface PolicySourceProps {
  mode: "trained" | "baseline" | "upload";
  setMode: (v: "trained" | "baseline" | "upload") => void;
  lockedMode: boolean;
  runId?: string;
  baseline: "equal" | "flat" | "first_long" | "random" | "buy_hold";
  setBaseline: (v: "equal" | "flat" | "first_long" | "random" | "buy_hold") => void;
  policyPath: string | null;
  onUpload: (file: File) => void;
  uploading: boolean;
  uploadError: string | null;
}

export function PolicySourceSection({
  mode,
  setMode,
  lockedMode,
  runId,
  baseline,
  setBaseline,
  policyPath,
  onUpload,
  uploading,
  uploadError,
}: PolicySourceProps) {
  return (
    <section className="rounded-xl border p-4 space-y-4">
      <div className="font-medium">Policy Source</div>
      <RadioGroup
        className="grid md:grid-cols-3 gap-3"
        value={mode}
        onValueChange={(v) => {
          if (!lockedMode) setMode(v as any);
        }}
      >
        <div className="flex items-center gap-2 rounded border p-3">
          <RadioGroupItem value="trained" id="src-trained" disabled={lockedMode} />
          <Label htmlFor="src-trained">Trained run</Label>
        </div>
        <div className="flex items-center gap-2 rounded border p-3">
          <RadioGroupItem
            value="baseline"
            id="src-baseline"
            disabled={lockedMode && mode !== "baseline"}
          />
          <Label htmlFor="src-baseline">Baseline policy</Label>
        </div>
        <div className="flex items-center gap-2 rounded border p-3">
          <RadioGroupItem value="upload" id="src-upload" disabled={lockedMode} />
          <Label htmlFor="src-upload">Upload PPO .zip</Label>
        </div>
      </RadioGroup>

      {mode === "trained" && (
        <div className="space-y-2">
          <Label>Run ID</Label>
          <Input value={runId ?? ""} readOnly placeholder="Provided by Dashboard" />
          {!runId && (
            <div className="text-xs text-muted-foreground">
              Tip: choose a run from Dashboard to prefill.
            </div>
          )}
        </div>
      )}

      {mode === "baseline" && (
        <div className="space-y-2">
          <Label>Baseline</Label>
          <select
            className="border rounded h-10 px-3 w-full"
            value={baseline}
            onChange={(e) => setBaseline(e.target.value as any)}
          >
            <option value="equal">equal</option>
            <option value="flat">flat</option>
            <option value="first_long">first_long</option>
            <option value="random">random</option>
            <option value="buy_hold">buy_hold</option>
          </select>
        </div>
      )}

      {mode === "upload" && (
        <div className="space-y-2">
          <Label>Policy .zip</Label>
          <div className="flex items-center gap-3">
            <Input
              type="file"
              accept=".zip"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onUpload(f);
              }}
            />
            <Button variant="outline" disabled={uploading}>
              {uploading ? "Uploading…" : "Upload"}
            </Button>
          </div>
          {policyPath && (
            <div className="text-xs text-muted-foreground break-all">
              Uploaded: {policyPath}
            </div>
          )}
          {uploadError && (
            <div className="text-xs text-red-600">{uploadError}</div>
          )}
        </div>
      )}
    </section>
  );
}

