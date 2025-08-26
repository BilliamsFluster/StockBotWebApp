"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Eye, EyeOff, ShieldCheck } from "lucide-react";
import { SettingsState } from "../lib/config";

interface Props {
  state: SettingsState;
  setState: React.Dispatch<React.SetStateAction<SettingsState>>;
}

export function PrivacyToggles({ state, setState }: Props) {
  return (
    <Card className="ink-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><ShieldCheck className="h-4 w-4" /> Privacy & Security</CardTitle>
        <CardDescription>Control redaction and opt in/out of telemetry.</CardDescription>
      </CardHeader>
      <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="flex items-center justify-between rounded-md bg-muted/40 p-3">
          <Label>Privacy Mode</Label>
          <Switch
            checked={state.privacy.privacyMode}
            onCheckedChange={(v) => setState(s => ({ ...s, privacy: { ...s.privacy, privacyMode: Boolean(v) } }))}
          />
        </div>
        <div className="flex items-center justify-between rounded-md bg-muted/40 p-3">
          <Label>Anonymous telemetry</Label>
          <Switch
            checked={state.privacy.telemetry}
            onCheckedChange={(v) => setState(s => ({ ...s, privacy: { ...s.privacy, telemetry: Boolean(v) } }))}
          />
        </div>

        {/* Demo: masking preview */}
        <div className="md:col-span-2 rounded-md bg-background/50 p-3">
          <div className="flex items-center gap-2 mb-2">
            {state.privacy.privacyMode ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            <Label>Preview</Label>
            <Badge variant="secondary">{state.privacy.privacyMode ? "Masked" : "Visible"}</Badge>
          </div>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <FieldPreview label="Account" value={mask(state.privacy.privacyMode, "ACC-001234")} />
            <FieldPreview label="Order" value={mask(state.privacy.privacyMode, "O-10093")} />
            <FieldPreview label="Balance" value={mask(state.privacy.privacyMode, "$127,420")} />
            <FieldPreview label="Positions" value={mask(state.privacy.privacyMode, "AAPL 120, NVDA 40")} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function FieldPreview({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-muted/40 p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="font-mono text-sm">{value}</div>
    </div>
  );
}

function mask(on: boolean, raw: string) {
  if (!on) return raw;
  return raw.replace(/[A-Za-z0-9]/g, (m, i) => (i % 2 === 0 ? "•" : m));
}
