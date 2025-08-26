"use client";

import * as React from "react";
import { toast } from "react-hot-toast";

/* --- Shadcn UI Components --- */
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Download, Upload, Copy, Info, ShieldCheck, BookOpen, Palette } from "lucide-react";

import { useSettings } from "./hooks/useSettings";
import { DEFAULTS, APP } from "./lib/config";
import { AppearanceControls } from "./shared/AppearanceControls";
import { PrivacyToggles } from "./shared/PrivacyToggles";
import { ReleaseNotesPanel } from "./shared/ReleaseNotesPanel";
import { AboutPanel } from "./shared/AboutPanel";

export default function SettingsPage() {
  const { state, setState } = useSettings();

  const onImport = async (file?: File) => {
    if (!file) return;
    const text = await file.text();
    try {
      const obj = JSON.parse(text);
      setState(obj);
      toast.success("Settings imported successfully.");
    } catch {
      toast.error("Import failed: Invalid JSON file.");
    }
  };

  const onExport = () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `settings_${APP.version}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Settings exported.");
  };

  const copy = (txt: string, msg = "Copied to clipboard") => {
    navigator.clipboard.writeText(txt);
    toast.success(msg);
  };

  return (
    <div className="p-4 md:p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl md:text-3xl font-semibold">Settings</h1>
          <p className="text-muted-foreground text-sm">Theme, privacy, app info, release notes & disclosures.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setState(DEFAULTS)}>Reset to Defaults</Button>
          <Button onClick={() => toast.success("Settings saved!")}>Save Settings</Button>
        </div>
      </div>

      <Tabs defaultValue="appearance" className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="appearance"><Palette className="h-4 w-4 mr-2" />Appearance</TabsTrigger>
          <TabsTrigger value="privacy"><ShieldCheck className="h-4 w-4 mr-2" />Privacy</TabsTrigger>
          <TabsTrigger value="info"><Info className="h-4 w-4 mr-2" />Info</TabsTrigger>
          <TabsTrigger value="about"><BookOpen className="h-4 w-4 mr-2" />About</TabsTrigger>
        </TabsList>

        {/* Appearance */}
        <TabsContent value="appearance" className="mt-4">
          <AppearanceControls state={state} setState={setState} />
        </TabsContent>

        {/* Privacy */}
        <TabsContent value="privacy" className="mt-4">
          <PrivacyToggles state={state} setState={setState} />
        </TabsContent>

        {/* Info */}
        <TabsContent value="info" className="mt-4">
          <Card className="ink-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Info className="h-4 w-4" /> App Info</CardTitle>
              <CardDescription>Environment & metadata. Copy or export your settings JSON.</CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <KeyVal k="Version" v={`v${APP.version}`} onCopy={() => copy(`v${APP.version}`)} />
              <KeyVal k="Build" v={APP.buildId} onCopy={() => copy(APP.buildId)} />
              <KeyVal k="Commit" v={APP.commit} onCopy={() => copy(APP.commit)} />
              <div className="space-y-2">
                <Label>Environment</Label>
                <Select value={state.info.env} onValueChange={(v:any)=>setState(s=>({...s, info:{...s.info, env:v}}))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="Live">Live</SelectItem><SelectItem value="Paper">Paper</SelectItem><SelectItem value="Sandbox">Sandbox</SelectItem></SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Language</Label>
                <Select value={state.info.language} onValueChange={(v:any)=>setState(s=>({...s, info:{...s.info, language:v}}))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="English">English</SelectItem><SelectItem value="Español">Español</SelectItem><SelectItem value="Deutsch">Deutsch</SelectItem></SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Currency</Label>
                <Select value={state.info.currency} onValueChange={(v:any)=>setState(s=>({...s, info:{...s.info, currency:v}}))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="USD">USD</SelectItem><SelectItem value="EUR">EUR</SelectItem><SelectItem value="JPY">JPY</SelectItem></SelectContent>
                </Select>
              </div>
              <div className="md:col-span-3 space-y-2">
                <Label>Notes</Label>
                <Textarea
                  placeholder="Internal notes about this environment…"
                  value={state.info.notes}
                  onChange={(e)=>setState(s=>({...s, info:{...s.info, notes:e.target.value}}))}
                />
              </div>
            </CardContent>
            <CardFooter className="flex items-center gap-2">
              <Button onClick={onExport}><Download className="mr-2 h-4 w-4" /> Export settings</Button>
              <label className="relative">
                <input type="file" accept="application/json" className="absolute inset-0 opacity-0 cursor-pointer"
                       onChange={(e)=>onImport(e.target.files?.[0])}/>
                <Button asChild variant="outline"><div className="flex items-center"><Upload className="mr-2 h-4 w-4" /> Import</div></Button>
              </label>
            </CardFooter>
          </Card>
        </TabsContent>

        {/* Release notes + Disclosures */}
        <TabsContent value="about" className="mt-4 space-y-4">
          <ReleaseNotesPanel />
          <AboutPanel />
        </TabsContent>
      </Tabs>
    </div>
  );
}

/* ------------------------ helpers ------------------------ */
function KeyVal({ k, v, onCopy }: { k: string; v: string; onCopy?: () => void }) {
  return (
    <div className="rounded-md bg-muted/40 p-3">
      <div className="text-xs text-muted-foreground">{k}</div>
      <div className="flex items-center justify-between gap-2">
        <div className="font-mono text-sm">{v}</div>
        {onCopy && (
          <Button variant="ghost" size="icon" onClick={onCopy} className="h-8 w-8">
            <Copy className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );
}
