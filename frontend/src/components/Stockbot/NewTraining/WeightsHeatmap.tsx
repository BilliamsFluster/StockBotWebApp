"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { buildUrl } from "@/api/client";
import dynamic from "next/dynamic";

function parseCSV(text: string): { headers: string[]; rows: string[][] } {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length === 0) return { headers: [], rows: [] };
  const headers = lines[0].split(",").map((s) => s.trim());
  const rows = lines.slice(1).map((ln) => ln.split(","));
  return { headers, rows };
}

function pickWeightColumns(headers: string[]): string[] {
  const skip = new Set([
    "ts",
    "equity",
    "cash",
    "drawdown",
    "gross_leverage",
    "net_leverage",
    "turnover",
    "r_base",
    "pen_turnover",
    "pen_drawdown",
    "pen_vol",
    "pen_leverage",
  ]);
  return headers.filter((h) => !skip.has(h.toLowerCase()));
}

const PlotlySurface = dynamic(() => import("../PlotlySurface"), { ssr: false });

export function WeightsHeatmap({ equityUrl, onClose, inline = false }: { equityUrl: string; onClose?: () => void; inline?: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [weights, setWeights] = useState<number[][]>([]); // [symbol][t]
  const [symbols, setSymbols] = useState<string[]>([]);
  const [show3d, setShow3d] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const resp = await fetch(buildUrl(equityUrl), { cache: "no-store", credentials: "include" });
        const text = await resp.text();
        const head = text.slice(0, 160).toLowerCase();
        if (head.includes("<!doctype") || head.includes("<html") || head.includes("__next_f")) {
          if (alive) { setSymbols([]); setWeights([]); }
          return;
        }
        const { headers, rows } = parseCSV(text);
        const cols = pickWeightColumns(headers);
        const idxs = cols.map((c) => headers.indexOf(c));
        const W: number[][] = cols.map(() => []);
        for (const r of rows) {
          idxs.forEach((j, k) => {
            const v = parseFloat(r[j] ?? "0");
            W[k].push(Number.isFinite(v) ? v : 0);
          });
        }
        if (!alive) return;
        setSymbols(cols);
        setWeights(W);
      } catch (e) {
        // ignore
      }
    })();
    return () => {
      alive = false;
    };
  }, [equityUrl]);

  useEffect(() => {
    const cvs = canvasRef.current;
    if (!cvs || weights.length === 0) return;
    const rows = weights.length;
    const cols = Math.max(...weights.map((w) => w.length));
    // Downsample columns if too many
    const maxCols = 600;
    const step = Math.max(1, Math.floor(cols / maxCols));
    const dsCols = Math.ceil(cols / step);
    const cell = 8; // px
    cvs.width = dsCols * cell;
    cvs.height = rows * cell;
    const ctx = cvs.getContext("2d")!;
    ctx.clearRect(0, 0, cvs.width, cvs.height);
    // color scale: -1 -> blue, 0 -> black, +1 -> red
    const color = (x: number) => {
      const v = Math.max(-1, Math.min(1, x || 0));
      if (v >= 0) {
        const r = Math.round(255 * v);
        return `rgb(${r},0,0)`;
      } else {
        const b = Math.round(255 * -v);
        return `rgb(0,0,${b})`;
      }
    };
    weights.forEach((row, i) => {
      for (let c = 0; c < dsCols; c++) {
        const j0 = c * step;
        const j1 = Math.min((c + 1) * step, row.length);
        const seg = row.slice(j0, j1);
        const v = seg.length ? seg.reduce((a, b) => a + b, 0) / seg.length : 0;
        ctx.fillStyle = color(v);
        ctx.fillRect(c * cell, i * cell, cell, cell);
      }
    });
  }, [weights]);

  const x3d = useMemo(() => (weights[0]?.map((_, i) => i) || []), [weights]);
  const y3d = useMemo(() => weights.map((_, i) => i), [weights]);

  const content = (
    <div>
      <div className="flex items-center justify-between mb-2">
        <div className="font-medium">Weights Heatmap</div>
        <div className="flex items-center gap-3">
          <label className="text-xs flex items-center gap-1">
            <input type="checkbox" checked={show3d} onChange={(e)=>setShow3d(e.target.checked)} /> 3D
          </label>
          {!inline && onClose && (
            <button className="text-sm underline" onClick={onClose}>Close</button>
          )}
        </div>
      </div>
      <div className="text-xs text-gray-600 mb-2">Rows are symbols; red=long, blue=short; columns are time (downsampled).</div>
      {weights.length === 0 && (
        <div className="text-xs text-muted-foreground">No weight data found in equity.csv.</div>
      )}
      {!show3d && weights.length > 0 && <canvas ref={canvasRef} className="border w-full" />}
      {show3d && weights.length > 0 && (
        <div className="w-full">
          <PlotlySurface x={x3d} y={y3d} z={weights} height={420} title="Weights Surface (symbol x time)" />
        </div>
      )}
      {symbols.length > 0 && (
        <div className="mt-2 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 text-xs">
          {symbols.map((s, i) => (
            <div key={`${s}-${i}`} className="flex items-center gap-2">
              <span className="inline-block w-2 h-2 bg-black"></span>
              <span>{i + 1}. {s}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  if (inline) return content;

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center" onClick={onClose}>
      <div className="bg-white rounded-md p-3 max-w-[95vw] max-h-[95vh] overflow-auto" onClick={(e) => e.stopPropagation()}>
        {content}
      </div>
    </div>
  );
}
