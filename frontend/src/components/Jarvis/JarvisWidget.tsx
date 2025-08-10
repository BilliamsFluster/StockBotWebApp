// path: components/Jarvis/JarvisWidget.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useJarvis } from "@/components/Jarvis/JarvisProvider";
import { gsap } from "gsap";
import { Draggable } from "gsap/Draggable";

gsap.registerPlugin(Draggable);

type Corner = "tl" | "tr" | "bl" | "br";
type JarvisState = "idle" | "listening" | "speaking"; // keep local for safety

function closestCorner(rect: DOMRect, vw: number, vh: number): Corner {
  const d = {
    tl: Math.hypot(rect.left, rect.top),
    tr: Math.hypot(vw - rect.right, rect.top),
    bl: Math.hypot(rect.left, vh - rect.bottom),
    br: Math.hypot(vw - rect.right, vh - rect.bottom),
  } as const;
  return (Object.entries(d).reduce((a, b) => (a[1] < b[1] ? a : b))[0] as Corner);
}

function stateColor(s: string) {
  // why: tolerate any provider value without type friction
  if (s === "listening") return "#22d3ee"; // cyan-400
  if (s === "speaking") return "#a78bfa"; // violet-400
  return "#94a3b8"; // slate-400
}

export default function JarvisWidget() {
  // Removed vuIn/vuOut dependency.
  const { enabled, setEnabled, state } = useJarvis();

  const [open, setOpen] = useState(false);
  const [dockCorner, setDockCorner] = useState<Corner>("br");

  const widgetRef = useRef<HTMLDivElement>(null);
  const orbitRef = useRef<HTMLDivElement>(null);
  const orbitTweenRef = useRef<gsap.core.Tween | null>(null);

  const BAR_COUNT = 24;
  const size = 64, view = 100, cx = 50, cy = 50;
  const rInner = 28, minLen = 5, maxLen = 16;

  // ------- reactive refs (no vu refs) -------
  const enabledRef = useRef(enabled);
  const stateRef = useRef<JarvisState>((state as JarvisState) || "idle");

  useEffect(() => { enabledRef.current = enabled; }, [enabled]);
  useEffect(() => { stateRef.current = (state as JarvisState) || "idle"; }, [state]);

  // unified "power" for graceful on/off (0..1)
  const powerRef = useRef(0);
  const setPower = (target: number, dur = 0.35) => {
    const obj = { p: powerRef.current };
    gsap.to(obj, {
      p: target,
      duration: dur,
      ease: "power2.out",
      onUpdate: () => { powerRef.current = obj.p; },
    });
  };

  // drive ring color via CSS var for zero-lag updates
  const ring = stateColor(state as string);
  useEffect(() => {
    if (widgetRef.current) widgetRef.current.style.setProperty("--ring", ring);
  }, [ring]);

  // levels (driven by synthesized meters)
  const levelsRef = useRef<number[]>(Array(BAR_COUNT).fill(0.1));
  const seeds = useRef<number[]>(
    Array.from({ length: BAR_COUNT }, (_, i) => {
      const s = Math.sin(i * 12.9898) * 43758.5453;
      return 0.85 + ((s - Math.floor(s)) * 0.3); // 0.85..1.15
    })
  );
  const [, force] = useState(0);

  // SPIN: create perpetual rotate tween once
  useEffect(() => {
    const el = orbitRef.current;
    if (!el) return;
    orbitTweenRef.current?.kill();
    gsap.set(el, { rotation: 0, transformOrigin: "50% 50%", willChange: "transform" });
    orbitTweenRef.current = gsap.to(el, {
      rotation: "+=360",
      duration: 2,
      repeat: -1,
      ease: "none",
    });
    return () => {
      orbitTweenRef.current?.kill();
      orbitTweenRef.current = null;
    };
  }, []);

  // Power reacts ONLY to enabled/state
  useEffect(() => {
    const on = enabled && stateRef.current !== "idle";
    setPower(on ? 1 : 0);
  }, [enabled, state]);

  // Smooth oscillator for synthetic loudness (0..1)
  const osc = (speed: number, offset = 0) => {
    const t = gsap.ticker.time + offset;
    const a = Math.sin(t * speed);
    const b = Math.sin(t * speed * 0.71 + 1.234);
    const c = Math.sin(t * speed * 1.21 + 2.456);
    const v = 0.5 + 0.25 * a + 0.2 * b + 0.05 * c;
    return Math.max(0, Math.min(1, v));
  };

  // Live loop via GSAP ticker (single subscription)
  useEffect(() => {
    const loop = () => {
      const isEnabled = enabledRef.current;
      const st = stateRef.current;

      let loud = 0;
      if (isEnabled && st !== "idle") {
        if (st === "speaking") {
          // why: stronger, slightly slower motion while speaking
          loud = 0.55 + 0.45 * osc(2.0);
        } else if (st === "listening") {
          // why: subtler, quicker twitches while listening
          loud = 0.35 + 0.45 * osc(3.4, 0.37);
        }
      }

      // update bar levels (fast attack, slow release)
      levelsRef.current = levelsRef.current.map((v, i) => {
        const t = Math.min(1, loud * seeds.current[i] * 1.15);
        const up = 0.35, down = 0.12;
        const raw = t > v ? v + (t - v) * up : v + (t - v) * down;
        return raw * (0.2 + 0.8 * powerRef.current);
      });

      // update spinner speed via timeScale (no restart)
      const spin = orbitTweenRef.current;
      if (spin) {
        const base = 0.25 + loud * 2.2; // 0.25x .. 2.45x
        const scaled = base * (0.25 + 0.75 * powerRef.current);
        gsap.to(spin, { timeScale: scaled, duration: 0.12, ease: "power2.out", overwrite: true });
      }

      // orbit/halo opacity driven by power (style computed on render)
      if (orbitRef.current) {
        const op = 0.15 + 0.85 * powerRef.current;
        orbitRef.current.style.opacity = String(op);
      }

      // trigger React paint
      force((n) => (n + 1) % 1_000_000);
    };

    gsap.ticker.add(loop);
    return () => {
      gsap.ticker.remove(loop);
    };
  }, []);

  // Drag + snap with resize docking
  useEffect(() => {
    const el = widgetRef.current;
    if (!el) return;

    const place = (c: Corner) => {
      const m = 16;
      const { width: w, height: h } = el.getBoundingClientRect();
      const map = {
        tl: { x: m, y: m },
        tr: { x: window.innerWidth - w - m, y: m },
        bl: { x: m, y: window.innerHeight - h - m },
        br: { x: window.innerWidth - w - m, y: window.innerHeight - h - m },
      } as const;
      gsap.to(el, { ...map[c], duration: 0.35, ease: "elastic.out(1,0.7)" });
    };

    gsap.set(el, { x: window.innerWidth - 92, y: window.innerHeight - 92 });

    const [drag] = Draggable.create(el, {
      type: "x,y",
      bounds: window,
      edgeResistance: 0.9,
      onPress() { gsap.to(el, { scale: 0.98, duration: 0.08 }); },
      onDrag() { setOpen(false); }, // don't depend on `open`
      onRelease() {
        gsap.to(el, { scale: 1, duration: 0.12 });
        const rect = el.getBoundingClientRect();
        const c = closestCorner(rect, window.innerWidth, window.innerHeight);
        setDockCorner(c);
        place(c);
      },
    });

    const onResize = () => place(dockCorner);
    window.addEventListener("resize", onResize);

    return () => {
      drag?.kill();
      window.removeEventListener("resize", onResize);
    };
  }, [dockCorner]);

  const popupPos = useMemo(() => {
    switch (dockCorner) {
      case "tl": return "left-0 top-16";
      case "tr": return "right-0 top-16";
      case "bl": return "left-0 bottom-16";
      case "br":
      default: return "right-0 bottom-16";
    }
  }, [dockCorner]);

  const active = enabled && (state as JarvisState) !== "idle";

  return (
    <>
      <div
        ref={widgetRef}
        className={[
          "fixed z-[9999] w-16 h-16 rounded-full",
          "bg-black/55 backdrop-blur-md border border-white/10",
          "shadow-[0_8px_30px_rgba(0,0,0,0.35)]",
          "cursor-pointer select-none outline-none",
        ].join(" ")}
        style={{ top: 0, left: 0 }}
        role="button"
        tabIndex={0}
        aria-label="Jarvis voice widget"
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => e.key === "Enter" && setOpen((v) => !v)}
      >
        {/* Halo (opacity follows power for smooth off) */}
        <div
          className="absolute inset-0 rounded-full pointer-events-none"
          style={{
            boxShadow: active
              ? `0 0 32px 6px color-mix(in srgb, var(--ring) 20%, transparent),\n                 inset 0 0 0 2px color-mix(in srgb, var(--ring) 60%, transparent)`
              : "inset 0 0 0 1px rgba(255,255,255,0.09)",
            transition: "box-shadow 220ms ease, opacity 240ms ease",
            opacity: 0.25 + 0.75 * powerRef.current,
          }}
        />

        {/* Orbit — GSAP rotates this element; color via --ring, opacity via power */}
        <div
          ref={orbitRef}
          className="absolute inset-0 rounded-full pointer-events-none"
          style={{
            mask: "radial-gradient(circle at center, transparent 52%, black 53%)",
            WebkitMask: "radial-gradient(circle at center, transparent 52%, black 53%)",
            background:
              "conic-gradient(from 0deg, color-mix(in srgb, var(--ring) 0%, transparent), color-mix(in srgb, var(--ring) 22%, transparent) 8%, transparent 24%)",
            opacity: 0.15 + 0.85 * powerRef.current,
            willChange: "transform, opacity",
          }}
        />

        {/* Radial audio ring (SVG) */}
        <svg className="absolute inset-0 pointer-events-none" width={size} height={size} viewBox={`0 0 ${view} ${view}`}>
          <g transform={`translate(${cx} ${cy})`}>
            {levelsRef.current.map((lvl, i) => {
              const a = (i / BAR_COUNT) * Math.PI * 2;
              const L = minLen + (maxLen - minLen) * lvl;
              const x1 = Math.cos(a) * rInner;
              const y1 = Math.sin(a) * rInner;
              const x2 = Math.cos(a) * (rInner + L);
              const y2 = Math.sin(a) * (rInner + L);
              const alpha = (0.35 + 0.55 * lvl) * (0.25 + 0.75 * powerRef.current);
              return (
                <line
                  key={i}
                  x1={x1}
                  y1={y1}
                  x2={x2}
                  y2={y2}
                  stroke={enabled ? "var(--ring)" : "rgba(148,163,184,0.7)"}
                  strokeOpacity={alpha}
                  strokeWidth={2}
                  strokeLinecap="round"
                />
              );
            })}
          </g>
        </svg>

        {/* Center label */}
        <div className="absolute inset-0 grid place-items-center pointer-events-none" style={{ opacity: 0.6 + 0.4 * powerRef.current }}>
          <div className="flex items-center gap-1">
            <span className="inline-block w-2 h-2 rounded-full" style={{ background: enabled ? "var(--ring)" : "#64748B" }} />
            <span className="text-[10px] leading-none font-medium text-white/85">
              {enabled ? ((state as JarvisState) === "idle" ? "Ready" : (state as string)) : "Off"}
            </span>
          </div>
        </div>

        {/* Popover */}
        {open && (
          <div
            className={[
              "absolute min-w-[220px] rounded-xl pointer-events-auto",
              "bg-zinc-900/90 backdrop-blur-md border border-white/10",
              "text-white shadow-2xl",
              popupPos,
            ].join(" ")}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-3">
              <div className="flex items-center justify-between pb-2 mb-2 border-b border-white/10">
                <div className="text-sm font-semibold">Jarvis Voice</div>
                <div className="text-[10px] px-2 py-0.5 rounded-full border border-white/10" style={{ color: "var(--ring)" }}>
                  {enabled ? (state as string) : "disabled"}
                </div>
              </div>
              <div className="space-y-2">
                <button
                  className="w-full px-3 py-2 rounded-lg bg-white/10 hover:bg-white/15 transition text-sm"
                  onClick={() => setEnabled(!enabled)}
                >
                  {enabled ? "Disable Voice Mode" : "Enable Voice Mode"}
                </button>
                <div className="grid grid-cols-3 gap-2">
                  <button className="px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-xs">Reset</button>
                  <button className="px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-xs">Settings</button>
                  <button className="px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-xs">Logs</button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
