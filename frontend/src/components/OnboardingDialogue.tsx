"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Dialog, DialogContent,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Progress } from "./ui/progress";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Check, CheckCircle2, Keyboard, Palette, Rocket, Sparkles, Bot, Shield,
} from "lucide-react";
import { cn } from "@/lib/utils";

export type OnboardingSettings = {
  env: "Paper" | "Live";
  theme: "system" | "dark" | "light";
  accent: "indigo" | "violet" | "blue" | "cyan" | "emerald";
  trueBlack: boolean;
  privacyMode: boolean;
  hotkeys: {
    enabled: boolean;
    buy: string;
    sell: string;
    ticket: string;
    cancelAll: string;
  };
};

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onApply?: (settings: OnboardingSettings) => Promise<void> | void;
  onOpenBrokers?: () => void;
};

const DEFAULTS: OnboardingSettings = {
  env: "Paper",
  theme: "dark",
  accent: "violet",
  trueBlack: true,
  privacyMode: false,
  hotkeys: { enabled: true, buy: "B", sell: "S", ticket: "T", cancelAll: "Esc" },
};

const STEPS = [
  { key: "welcome",    title: "Welcome",            icon: Sparkles },
  { key: "connect",    title: "Connect (optional)", icon: Bot },
  { key: "environment",title: "Choose Environment", icon: Rocket },
  { key: "theme",      title: "Theme & Privacy",    icon: Palette },
  { key: "hotkeys",    title: "Hotkeys",            icon: Keyboard },
  { key: "finish",     title: "Finish",             icon: CheckCircle2 },
] as const;

export function OnboardingDialog({ open, onOpenChange, onApply, onOpenBrokers }: Props) {
  const router = useRouter();
  const [step, setStep] = React.useState(0);
  const [settings, setSettings] = React.useState(DEFAULTS);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    localStorage.setItem("onboarding_settings_v1", JSON.stringify(settings));
  }, [settings]);

  React.useEffect(() => {
    document.documentElement.dataset.accent = settings.accent;
    document.documentElement.dataset.trueBlack = String(settings.trueBlack);

    if (settings.theme === 'light') {
      document.documentElement.classList.remove('dark');
    } else if (settings.theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
    }
  }, [settings.theme, settings.accent, settings.trueBlack]);

  const progress = Math.round(((step + 1) / STEPS.length) * 100);

  const next = () => setStep((s) => Math.min(s + 1, STEPS.length - 1));
  const prev = () => setStep((s) => Math.max(s - 1, 0));

  const updateSetting = <K extends keyof OnboardingSettings>(key: K, value: OnboardingSettings[K]) => {
    setSettings(prev => ({ ...prev, [key]: value }));
  };

  const finish = async () => {
    try {
      setBusy(true);
      localStorage.setItem("onboarding_done_v1", "true");
      if (onApply) await onApply(settings);
      onOpenChange(false);
      router.push("/overview");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl p-0">
        <div className="grid grid-cols-1 md:grid-cols-[250px_1fr]">
          <div className="hidden md:block p-6 border-r">
            <h2 className="text-lg font-semibold mb-4">Setup</h2>
            <div className="space-y-1">
              {STEPS.map((s, i) => (
                <button
                  key={s.key}
                  onClick={() => setStep(i)}
                  disabled={i > step}
                  className={cn(
                    "w-full flex items-center gap-3 text-left px-3 py-2 rounded-md text-muted-foreground transition-colors",
                    step === i && "bg-primary/10 text-primary font-semibold",
                    step > i && "hover:bg-accent hover:text-accent-foreground",
                    i > step && "text-muted-foreground/50 cursor-not-allowed"
                  )}
                >
                  <s.icon className="h-5 w-5" />
                  {s.title}
                </button>
              ))}
            </div>
          </div>

          <div className="p-6 md:p-8 flex flex-col">
            <div className="mb-6">
              <h3 className="text-2xl font-bold mb-2">{STEPS[step].title}</h3>
            </div>

            <div className="min-h-[300px] flex-1">
              {step === 0 && <WelcomeStep />}
              {step === 1 && <ConnectStep onOpenBrokers={onOpenBrokers} />}
              {step === 2 && <EnvironmentStep settings={settings} onUpdate={updateSetting} />}
              {step === 3 && <ThemeStep settings={settings} onUpdate={updateSetting} />}
              {step === 4 && <HotkeysStep settings={settings} onUpdate={updateSetting} />}
              {step === 5 && <FinishStep />}
            </div>

            <div className="mt-4 flex w-full items-center justify-between border-t pt-4">
              <Button variant="ghost" onClick={prev} disabled={step === 0}>
                Back
              </Button>
              <div className="flex items-center gap-2">
                <Progress value={progress} className="w-24" />
                {step < STEPS.length - 1 ? (
                  <Button onClick={next}>Next</Button>
                ) : (
                  <Button onClick={finish} disabled={busy}>
                    {busy ? "Saving..." : "Finish"}
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ---------------------- Step Components ---------------------- */

function WelcomeStep() {
  return (
    <div className="space-y-3">
      <h3 className="text-lg font-medium">Welcome to Jarvis StockBot</h3>
      <p className="text-sm text-muted-foreground">
        We’ll personalize your experience—environment, theme, privacy, and hotkeys. You can change these anytime in Settings.
      </p>
      <ul className="mt-2 grid grid-cols-1 gap-2 text-sm text-foreground/80 md:grid-cols-2">
        <li className="inline-flex items-center gap-2"><Sparkles className="h-4 w-4 text-primary" /> Guided setup in under 2 minutes</li>
        <li className="inline-flex items-center gap-2"><Shield className="h-4 w-4 text-primary" /> Privacy mode for demos & screenshots</li>
        <li className="inline-flex items-center gap-2"><Keyboard className="h-4 w-4 text-primary" /> Global hotkeys for quick trading</li>
        <li className="inline-flex items-center gap-2"><Palette className="h-4 w-4 text-primary" /> True-black theme & accent colors</li>
      </ul>
    </div>
  );
}

function ConnectStep({ onOpenBrokers }: { onOpenBrokers?: () => void }) {
  return (
    <div className="space-y-3">
      <h3 className="text-lg font-medium">Connect a brokerage (optional)</h3>
      <p className="text-sm text-muted-foreground">
        Use a secure OAuth/API-key flow to enable portfolio sync and trading. You can do this later in the Brokers page.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button variant="outline" className="border-border hover:bg-accent" onClick={onOpenBrokers}>
          Open Brokers
        </Button>
        <Button variant="ghost" onClick={onOpenBrokers}>I’ll do this later</Button>
      </div>
      <p className="text-xs text-muted-foreground/70 mt-2">
        Credentials are encrypted; permissions are least-privilege. You’re always in control.
      </p>
    </div>
  );
}

function EnvironmentStep({ settings, onUpdate }: { settings: OnboardingSettings, onUpdate: <K extends keyof OnboardingSettings>(key: K, value: OnboardingSettings[K]) => void }) {
  return (
    <div className="space-y-4">
      <h3 className="text-lg font-medium">Choose your environment</h3>
      <RadioGroup
        value={settings.env}
        onValueChange={(v: "Paper" | "Live") => onUpdate('env', v)}
        className="grid grid-cols-1 gap-3 md:grid-cols-2"
      >
        <EnvCard
          value="Paper"
          selected={settings.env === "Paper"}
          title="Paper (recommended)"
          desc="Practice with simulated funds and real market data."
        />
        <EnvCard
          value="Live"
          selected={settings.env === "Live"}
          title="Live"
          desc="Execute real trades. Requires an active broker connection."
        />
      </RadioGroup>
      <p className="text-xs text-muted-foreground/80">You can switch anytime from Settings.</p>
    </div>
  );
}

function EnvCard({ value, selected, title, desc }: {
  value: "Paper" | "Live"; selected: boolean; title: string; desc: string;
}) {
  return (
    <Label
      htmlFor={`env-${value}`}
      className={cn(
        "cursor-pointer rounded-lg border p-4 transition-colors",
        selected ? "border-primary bg-primary/10" : "border-border bg-accent/50 hover:bg-accent/80"
      )}
    >
      <div className="flex items-start gap-3">
        <RadioGroupItem id={`env-${value}`} value={value} className="mt-1" />
        <div>
          <div className="font-medium">{title}</div>
          <div className="text-sm text-muted-foreground">{desc}</div>
        </div>
      </div>
    </Label>
  );
}

function ThemeStep({ settings, onUpdate }: { settings: OnboardingSettings, onUpdate: <K extends keyof OnboardingSettings>(key: K, value: OnboardingSettings[K]) => void }) {
  const accents: OnboardingSettings['accent'][] = ["violet", "indigo", "blue", "cyan", "emerald"];
  return (
    <div className="space-y-6">
      <div>
        <Label>Accent Color</Label>
        <div className="flex gap-2 mt-2">
          {accents.map(accent => (
            <AccentSwatch
              key={accent}
              accent={accent}
              isSelected={settings.accent === accent}
              onClick={() => onUpdate('accent', accent)}
            />
          ))}
        </div>
      </div>
      <div>
        <Label>Theme</Label>
        <RadioGroup value={settings.theme} onValueChange={(v: any) => onUpdate('theme', v)} className="flex gap-4 mt-2">
          <Label className="flex items-center gap-2 cursor-pointer"><RadioGroupItem value="light" /> Light</Label>
          <Label className="flex items-center gap-2 cursor-pointer"><RadioGroupItem value="dark" /> Dark</Label>
          <Label className="flex items-center gap-2 cursor-pointer"><RadioGroupItem value="system" /> System</Label>
        </RadioGroup>
      </div>
      <div className="flex items-center justify-between">
        <div>
          <Label>True Black</Label>
          <p className="text-xs text-muted-foreground">Use a pure black background in dark mode.</p>
        </div>
        <Switch checked={settings.trueBlack} onCheckedChange={(v) => onUpdate('trueBlack', v)} disabled={settings.theme === 'light'} />
      </div>
      <div className="flex items-center justify-between">
        <div>
          <Label>Privacy Mode</Label>
          <p className="text-xs text-muted-foreground">Hide sensitive portfolio data.</p>
        </div>
        <Switch checked={settings.privacyMode} onCheckedChange={(v) => onUpdate('privacyMode', v)} />
      </div>
    </div>
  );
}

function AccentSwatch({ accent, isSelected, onClick }: { accent: string, isSelected: boolean, onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "h-8 w-8 rounded-full border-2 flex items-center justify-center transition-all",
        `accent-swatch-${accent}`,
        isSelected ? "border-primary" : "border-transparent hover:border-primary/50"
      )}
    >
      {isSelected && <Check className="h-5 w-5 text-primary-foreground" />}
    </button>
  );
}

function HotkeysStep({ settings, onUpdate }: { settings: OnboardingSettings, onUpdate: <K extends keyof OnboardingSettings>(key: K, value: OnboardingSettings[K]) => void }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <Label>Enable Hotkeys</Label>
          <p className="text-xs text-muted-foreground">Use global keyboard shortcuts for trading.</p>
        </div>
        <Switch
          checked={settings.hotkeys.enabled}
          onCheckedChange={(v) => onUpdate('hotkeys', { ...settings.hotkeys, enabled: v })}
        />
      </div>
      <div className={cn("space-y-2", !settings.hotkeys.enabled && "opacity-50")}>
        <div className="flex justify-between items-center"><span>Buy</span><Badge variant="outline">{settings.hotkeys.buy}</Badge></div>
        <div className="flex justify-between items-center"><span>Sell</span><Badge variant="outline">{settings.hotkeys.sell}</Badge></div>
        <div className="flex justify-between items-center"><span>Open Trade Ticket</span><Badge variant="outline">{settings.hotkeys.ticket}</Badge></div>
        <div className="flex justify-between items-center"><span>Cancel All Orders</span><Badge variant="outline">{settings.hotkeys.cancelAll}</Badge></div>
      </div>
    </div>
  );
}

function FinishStep() {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center">
      <CheckCircle2 className="h-16 w-16 text-green-500 mb-4" />
      <h3 className="text-xl font-bold">You're All Set!</h3>
      <p className="text-muted-foreground">
        Your workspace is ready. Click Finish to jump in.
      </p>
    </div>
  );
}
