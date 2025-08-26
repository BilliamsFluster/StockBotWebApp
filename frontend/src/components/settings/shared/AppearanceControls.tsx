"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { Palette, Sun, Moon, Settings as SettingsIcon } from "lucide-react";
import { SettingsState, ACCENT_OPTIONS } from "../lib/config";

interface Props {
  state: SettingsState;
  setState: React.Dispatch<React.SetStateAction<SettingsState>>;
}

export function AppearanceControls({ state, setState }: Props) {
  return (
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
            <Button variant={state.appearance.mode === "light" ? "default" : "outline"} onClick={() => setState(s => ({ ...s, appearance: { ...s.appearance, mode: "light" } }))}>
              <Sun className="mr-2 h-4 w-4" /> Light
            </Button>
            <Button variant={state.appearance.mode === "dark" ? "default" : "outline"} onClick={() => setState(s => ({ ...s, appearance: { ...s.appearance, mode: "dark" } }))}>
              <Moon className="mr-2 h-4 w-4" /> Dark
            </Button>
            <Button variant={state.appearance.mode === "system" ? "default" : "outline"} onClick={() => setState(s => ({ ...s, appearance: { ...s.appearance, mode: "system" } }))}>
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
            onCheckedChange={(v) => setState(s => ({ ...s, appearance: { ...s.appearance, trueBlack: Boolean(v) } }))}
          />
        </div>

        {/* Accent */}
        <div className="space-y-2">
          <Label>Accent</Label>
          <Select
            value={state.appearance.accent}
            onValueChange={(v) => setState(s => ({ ...s, appearance: { ...s.appearance, accent: v as any } }))}
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
            onValueChange={(v) => setState(s => ({ ...s, appearance: { ...s.appearance, density: v as any } }))}
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
            onCheckedChange={(v) => setState(s => ({ ...s, appearance: { ...s.appearance, animations: Boolean(v) } }))}
          />
        </div>
      </CardContent>
    </Card>
  );
}
