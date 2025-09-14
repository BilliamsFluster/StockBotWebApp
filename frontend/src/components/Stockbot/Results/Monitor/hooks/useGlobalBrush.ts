"use client";

import React, { createContext, useContext, useState } from "react";

export type Brush = { t0: number; t1: number };

const BrushContext = createContext<{
  brush: Brush;
  setBrush: React.Dispatch<React.SetStateAction<Brush>>;
} | null>(null);

export function GlobalBrushProvider({ children }: { children: React.ReactNode }) {
  const [brush, setBrush] = useState<Brush>({ t0: 0, t1: 0 });
  return <BrushContext.Provider value={{ brush, setBrush }}>{children}</BrushContext.Provider>;
}

export function useGlobalBrush() {
  const ctx = useContext(BrushContext);
  if (!ctx) throw new Error("useGlobalBrush must be used within GlobalBrushProvider");
  return ctx;
}

