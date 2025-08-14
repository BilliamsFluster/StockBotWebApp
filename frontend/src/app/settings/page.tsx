"use client";

import * as React from "react";
import { toast } from "react-hot-toast";

/* --- Shadcn UI Components --- */
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Download, Upload, Info, ShieldCheck, BookOpen, Copy, Moon, Sun, Palette, Eye, EyeOff, Settings as SettingsIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/* ---------------------------------- */
type SettingsState = {
  appearance: {
    mode: "system" | "light" | "dark";
    trueBlack: boolean;
    accent: "indigo" | "violet" | "blue" | "cyan" | "emerald";
    density: "cozy" | "compact";
    animations: boolean;
  };
  privacy: {
    privacyMode: boolean; // masks sensitive info in UI
    redactAccountIds: boolean;
    redactOrderIds: boolean;
    telemetry: boolean; // anonymous usage metrics
  };
  info: {
    env: "Paper" | "Live" | "Sandbox";
    language: "English" | "Español" | "Deutsch";
    currency: "USD" | "EUR" | "JPY";
    notes: string;
  };
};

const DEFAULTS: SettingsState = {
  appearance: {
    mode: "dark",
    trueBlack: true,
    accent: "violet",
    density: "cozy",
    animations: true,
  },
  privacy: {
    privacyMode: false,
    redactAccountIds: true,
    redactOrderIds: true,
    telemetry: false,
  },
  info: {
    env: "Paper",
    language: "English",
    currency: "USD",
    notes: "",
  },
};

const ACCENT_OPTIONS = [
  { value: "violet", label: "Violet" },
  { value: "indigo", label: "Indigo" },
  { value: "blue", label: "Blue" },
  { value: "cyan", label: "Cyan" },
  { value: "emerald", label: "Emerald" },
] as const;

// Mock app build data — wire to your real env if available
const APP = {
  version: "1.7.0",
  buildId: "2025.08.13-rc2",
  commit: "c1e9a42",
  buildDate: "2025-08-13",
};

export default function SettingsPage() {
  const [state, setState] = React.useState<SettingsState>(() => {
    try {
      const raw = localStorage.getItem("settings");
      return raw ? JSON.parse(raw) : DEFAULTS;
    } catch {
      return DEFAULTS;
    }
  });

  // apply UI side effects (theme + accent + density + true-black)
  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    const root = document.documentElement;

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleSystemThemeChange = (e: MediaQueryListEvent) => {
      root.classList.toggle('dark', e.matches);
    };
    
    mediaQuery.removeEventListener('change', handleSystemThemeChange);
    
    if (state.appearance.mode === 'system') {
      root.classList.toggle('dark', mediaQuery.matches);
      mediaQuery.addEventListener('change', handleSystemThemeChange);
    } else {
      root.classList.toggle('dark', state.appearance.mode === 'dark');
    }

    root.dataset.trueBlack = String(state.appearance.trueBlack);
    root.dataset.accent = state.appearance.accent;
    root.dataset.density = state.appearance.density;
    root.dataset.anim = state.appearance.animations ? "on" : "off";
    root.dataset.privacy = state.privacy.privacyMode ? "on" : "off";

    localStorage.setItem("settings", JSON.stringify(state));

    return () => {
      mediaQuery.removeEventListener('change', handleSystemThemeChange);
    };
  }, [state]);

  const onImport = async (file?: File) => {
    if (!file) return;
    const text = await file.text();
    try {
      const obj = JSON.parse(text) as SettingsState;
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

  const downloadReleaseNotes = () => {
    const md = `# Release Notes v${APP.version} (${APP.buildDate})\n- New: Brokers page with connection tools and status.\n- New: Overview page with StockBot performance tiles.\n- Improved: True-black theme & animated background blobs.\n- Fix: Order ticket validation edge cases.\n\n## Previous\n${RELEASE_NOTES.map(n=>`### v${n.version} — ${n.date}\n${n.items.map(i=>`- ${i}`).join("\n")}`).join("\n\n")}`;
    const blob = new Blob([md], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `RELEASE_NOTES_v${APP.version}.md`;
    a.click();
    URL.revokeObjectURL(url);
    a.remove();
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
          <Card className="ink-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Palette className="h-4 w-4" /> Theme / Look & Feel</CardTitle>
              <CardDescription>Choose mode, accent, density, and background behavior.</CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Mode */}
              <div className="space-y-2">
                <Label>Mode</Label>
                <div className="flex items-center gap-2">
                  <Button variant={state.appearance.mode==="light"?"default":"outline"} onClick={()=>setState(s=>({...s, appearance:{...s.appearance, mode:"light"}}))}>
                    <Sun className="mr-2 h-4 w-4" /> Light
                  </Button>
                  <Button variant={state.appearance.mode==="dark"?"default":"outline"} onClick={()=>setState(s=>({...s, appearance:{...s.appearance, mode:"dark"}}))}>
                    <Moon className="mr-2 h-4 w-4" /> Dark
                  </Button>
                  <Button variant={state.appearance.mode==="system"?"default":"outline"} onClick={()=>setState(s=>({...s, appearance:{...s.appearance, mode:"system"}}))}>
                    <SettingsIcon className="mr-2 h-4 w-4" /> System
                  </Button>
                </div>
              </div>

              {/* True black */}
              <div className="flex items-center justify-between rounded-md bg-muted/40 p-3">
                <div>
                  <Label>True black canvas</Label>
                  <p className="text-muted-foreground text-xs">Use pure #000 backgrounds for OLED displays.</p>
                </div>
                <Switch
                  checked={state.appearance.trueBlack}
                  onCheckedChange={(v)=>setState(s=>({...s, appearance:{...s.appearance, trueBlack:Boolean(v)}}))}
                />
              </div>

              {/* Accent */}
              <div className="space-y-2">
                <Label>Accent</Label>
                <Select
                  value={state.appearance.accent}
                  onValueChange={(v: any)=>setState(s=>({...s, appearance:{...s.appearance, accent:v}}))}
                >
                  <SelectTrigger><SelectValue placeholder="Accent color" /></SelectTrigger>
                  <SelectContent>
                    {ACCENT_OPTIONS.map(opt => (
                      <SelectItem key={opt.value} value={opt.value}>
                        <div className="flex items-center gap-2">
                          <div className={cn("h-4 w-4 rounded-full", `accent-swatch-${opt.value}`)} />
                          <span>{opt.label}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Density */}
              <div className="space-y-2">
                <Label>Density</Label>
                <Select
                  value={state.appearance.density}
                  onValueChange={(v:any)=>setState(s=>({...s, appearance:{...s.appearance, density:v}}))}
                >
                  <SelectTrigger><SelectValue placeholder="Density" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cozy">Cozy</SelectItem>
                    <SelectItem value="compact">Compact</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Animations */}
              <div className="flex items-center justify-between rounded-md bg-muted/40 p-3 md:col-span-2">
                <div>
                  <Label>Animations</Label>
                  <p className="text-muted-foreground text-xs">Disable for maximum performance or to reduce motion.</p>
                </div>
                <Switch
                  checked={state.appearance.animations}
                  onCheckedChange={(v)=>setState(s=>({...s, appearance:{...s.appearance, animations:Boolean(v)}}))}
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Privacy */}
        <TabsContent value="privacy" className="mt-4">
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
                  onCheckedChange={(v)=>setState(s=>({...s, privacy:{...s.privacy, privacyMode:Boolean(v)}}))}
                />
              </div>
              <div className="flex items-center justify-between rounded-md bg-muted/40 p-3">
                <Label>Anonymous telemetry</Label>
                <Switch
                  checked={state.privacy.telemetry}
                  onCheckedChange={(v)=>setState(s=>({...s, privacy:{...s.privacy, telemetry:Boolean(v)}}))}
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
        </TabsContent>

        {/* Info */}
        <TabsContent value="info" className="mt-4">
          <Card className="ink-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Info className="h-4 w-4" /> App Info</CardTitle>
              <CardDescription>Environment & metadata. Copy or export your settings JSON.</CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <KeyVal k="Version" v={`v${APP.version}`} onCopy={()=>copy(`v${APP.version}`)} />
              <KeyVal k="Build" v={APP.buildId} onCopy={()=>copy(APP.buildId)} />
              <KeyVal k="Commit" v={APP.commit} onCopy={()=>copy(APP.commit)} />
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
          <Card className="ink-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><BookOpen className="h-4 w-4" /> Release Notes</CardTitle>
              <CardDescription>What’s new and what changed.</CardDescription>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-64 rounded-md bg-background/50 p-3">
                <div className="space-y-6">
                  <div>
                    <div className="flex items-center gap-2">
                      <Badge>Latest</Badge>
                      <span className="font-medium">v{APP.version}</span>
                      <span className="text-muted-foreground text-xs">{APP.buildDate}</span>
                    </div>
                    <ul className="mt-2 list-disc pl-5 text-sm">
                      <li>New: Brokers page with connection tools and status.</li>
                      <li>New: Overview page with StockBot performance tiles.</li>
                      <li>Improved: True-black theme & animated background blobs.</li>
                      <li>Fix: Order ticket validation edge cases.</li>
                    </ul>
                  </div>
                  {RELEASE_NOTES.map((n) => (
                    <div key={n.version}>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">v{n.version}</span>
                        <span className="text-muted-foreground text-xs">{n.date}</span>
                      </div>
                      <ul className="mt-2 list-disc pl-5 text-sm">
                        {n.items.map((i, idx) => <li key={idx}>{i}</li>)}
                      </ul>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </CardContent>
            <CardFooter>
              <Button variant="outline" onClick={downloadReleaseNotes}><Download className="mr-2 h-4 w-4" /> Download .md</Button>
            </CardFooter>
          </Card>

          <Card className="ink-card">
            <CardHeader>
              <CardTitle>Disclosures</CardTitle>
              <CardDescription>Important information about risks, data, and broker connectivity.</CardDescription>
            </CardHeader>
            <CardContent>
              <Accordion type="multiple" className="w-full">
                <AccordionItem value="risk"><AccordionTrigger>Trading & Market Risk</AccordionTrigger><AccordionContent className="text-sm text-muted-foreground">Trading involves risk of loss. Backtested or simulated performance is hypothetical and may differ from live trading results.</AccordionContent></AccordionItem>
                <AccordionItem value="data"><AccordionTrigger>Data Sources & Latency</AccordionTrigger><AccordionContent className="text-sm text-muted-foreground">Quotes, fundamentals, and news are provided by third parties and may be delayed or inaccurate. Always verify critical information with your broker.</AccordionContent></AccordionItem>
                <AccordionItem value="broker"><AccordionTrigger>Broker Integrations</AccordionTrigger><AccordionContent className="text-sm text-muted-foreground">OAuth tokens/keys are stored securely per your backend configuration. Placing live orders requires explicit user action and an active broker connection.</AccordionContent></AccordionItem>
                <AccordionItem value="privacy"><AccordionTrigger>Privacy Mode</AccordionTrigger><AccordionContent className="text-sm text-muted-foreground">Privacy Mode masks sensitive values in the UI only. It does not scrub server logs or external integrations—configure those separately.</AccordionContent></AccordionItem>
              </Accordion>
              <Alert className="mt-4" variant="default"><Info className="h-4 w-4" /><AlertTitle>Reminder</AlertTitle><AlertDescription>Review your jurisdiction’s regulations and your broker’s agreements before enabling live trading.</AlertDescription></Alert>
            </CardContent>
          </Card>
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

/* Past releases (mock). Replace with your CHANGELOG feed if available. */
const RELEASE_NOTES = [
  { version: "1.6.3", date: "2025-08-05", items: ["Add DOM ladder widget", "Portfolio filters & export", "Improve blotter performance"] },
  { version: "1.6.0", date: "2025-07-28", items: ["Initial StockBot runs tab", "Backtest report export", "Risk panel (VaR/ES)"] },
];
