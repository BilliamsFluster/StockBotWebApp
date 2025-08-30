"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { Button } from "@/components/ui/button";
import {
  Card, CardContent, CardHeader, CardTitle, CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Bot, Rocket, Brain, BarChart2, Signal, Database, TrendingUp, Shield, KeyRound, Lock, Workflow, PlayCircle, Rocket as Rocket2, LineChart, Zap,
} from "lucide-react";

/** Revamped marketing page — no specific broker names, no testimonials, updated stats. */
export default function LandingPage() {
  const heroRef = useRef<HTMLDivElement>(null);
  const statsRef = useRef<HTMLDivElement>(null);
  const featuresRef = useRef<HTMLDivElement>(null);
  const stepsRef = useRef<HTMLDivElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const trustRef = useRef<HTMLDivElement>(null);
  const ctaRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    gsap.registerPlugin(ScrollTrigger);
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) return;

    const fadeUp = (el: Element | null, offset = 40, delay = 0) => {
      if (!el) return;
      gsap.fromTo(
        el,
        { opacity: 0, y: offset },
        {
          opacity: 1, y: 0, duration: 0.7, ease: "power2.out", delay,
          scrollTrigger: { trigger: el, start: "top 85%", once: true },
        }
      );
    };

    [heroRef, statsRef, featuresRef, stepsRef, previewRef, trustRef, ctaRef].forEach((r, i) =>
      fadeUp(r?.current!, 30, i * 0.05)
    );

    return () => ScrollTrigger.getAll().forEach((st) => st.kill());
  }, []);

  return (
    <div className="relative w-full overflow-hidden">
      <Aurora />

      {/* NAV */}
      <header className="relative z-10 mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <Link href="/" className="flex items-center gap-2">
          <span className="inline-flex size-8 items-center justify-center rounded-md bg-white/5 ring-1 ring-white/10">
            <Bot className="h-4 w-4 text-white/90" />
          </span>
          <span className="text-lg font-semibold tracking-tight bg-gradient-to-r from-indigo-300 via-violet-300 to-fuchsia-300 bg-clip-text text-transparent">
            Jarvis StockBot
          </span>
        </Link>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="border-white/15 text-white/70">Paper & Live</Badge>
          <Badge variant="outline" className="border-white/15 text-white/70">Broker-neutral</Badge>
          <Button asChild className="ml-3 btn-gradient">
            <Link href="/auth">Get Started</Link>
          </Button>
        </div>
      </header>

      {/* HERO (kept like your screenshot) */}
      <section ref={heroRef} className="relative z-10 mx-auto max-w-6xl px-6 pt-6 pb-16 md:pt-10">
        <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/70">
          <span className="inline-flex items-center gap-1"><Rocket className="h-3.5 w-3.5 text-violet-300" /> v1.7</span>
          <span className="text-white/40">•</span>
          <span>New overview, brokers, settings</span>
        </div>

        <h1 className="mt-5 text-5xl font-semibold leading-tight tracking-tight text-white md:text-7xl">
          Trade smarter. <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 via-violet-400 to-fuchsia-400">Sleep better.</span>
        </h1>
        <p className="mt-5 max-w-2xl text-lg text-white/70 md:text-xl">
          Real-time AI signals, risk controls, and execution—wrapped in a fast, secure platform designed for paper and live trading.
        </p>

        <div className="mt-8 flex flex-wrap items-center gap-3">
          <Button asChild size="lg" className="btn-gradient">
            <Link href="/auth">Start Free (Paper)</Link>
          </Button>
          <Button asChild size="lg" variant="outline" className="border-white/15 hover:bg-white/10">
            <Link href="/overview">See the Platform</Link>
          </Button>
          <span className="text-xs text-white/50">No credit card • Cancel anytime</span>
        </div>
      </section>

      {/* STATS (updated: keep Models & Backtests; replace others) */}
      <section ref={statsRef} className="relative z-10 mx-auto max-w-6xl px-6">
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {[
            { icon: <Brain className="h-4 w-4 text-indigo-300" />, k: "Models run", v: "3,142" },
            { icon: <BarChart2 className="h-4 w-4 text-fuchsia-300" />, k: "Backtests", v: "12,870" },
            { icon: <Signal className="h-4 w-4 text-violet-300" />, k: "Signals served", v: "8.9M" },
            { icon: <Database className="h-4 w-4 text-sky-300" />, k: "Datasets ingested", v: "1,204" },
          ].map(({ icon, k, v }) => (
            <Card key={k} className="bg-black/40 backdrop-blur border-white/10">
              <CardContent className="p-4">
                <div className="flex items-center justify-between text-xs text-white/60">{k}{icon}</div>
                <div className="mt-1 text-2xl font-semibold text-white">{v}</div>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* VALUE PROPS */}
      <section ref={featuresRef} className="relative z-10 mx-auto max-w-6xl px-6 py-14">
        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          <Feature
            icon={<LineChart className="h-5 w-5 text-indigo-300" />}
            title="Live Market Analytics"
            text="Tape, depth, and alerts tuned for real decisions—not noise."
          />
          <Feature
            icon={<Zap className="h-5 w-5 text-fuchsia-300" />}
            title="AI Trading Support"
            text="Signals with confidence & rationale so you can act fast."
          />
          <Feature
            icon={<Workflow className="h-5 w-5 text-violet-300" />}
            title="Backtest → Deploy"
            text="Walk-forward, Monte Carlo, and one-click paper/live deployment."
          />
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section ref={stepsRef} className="relative z-10 mx-auto max-w-6xl px-6 py-4">
        <h3 className="text-center text-2xl font-semibold text-white">How it works</h3>
        <p className="mt-2 text-center text-white/60">From zero to signals in minutes.</p>
        <div className="mt-8 grid grid-cols-1 gap-5 md:grid-cols-4">
          <Step n={1} icon={<KeyRound className="h-5 w-5" />} title="Connect" text="Authorize your brokerage securely." />
          <Step n={2} icon={<Database className="h-5 w-5" />} title="Configure" text="Pick strategies and risk controls." />
          <Step n={3} icon={<PlayCircle className="h-5 w-5" />} title="Backtest" text="Run realistic tests with costs and slippage." />
          <Step n={4} icon={<Rocket2 className="h-5 w-5" />} title="Go Live" text="Deploy to paper or live instantly." />
        </div>
      </section>

      {/* VISUAL PREVIEW */}
      <section ref={previewRef} className="relative z-10 mx-auto max-w-6xl px-6 py-16">
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <Card className="gradient-border bg-black/50 backdrop-blur">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-indigo-300" /> Equity & Drawdown
              </CardTitle>
              <CardDescription>YTD performance (sample)</CardDescription>
            </CardHeader>
            <CardContent><EquityPreview /></CardContent>
          </Card>

          <Card className="gradient-border bg-black/50 backdrop-blur">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Signal className="h-4 w-4 text-fuchsia-300" /> Live Predictions
              </CardTitle>
              <CardDescription>Scores with confidence</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="font-mono text-sm rounded-md border border-white/10 bg-black/40 p-3 text-white/90">
                [10:59:44] NVDA +0.22 σ • BUY (conf 0.62) • risk ok{'\n'}
                [10:59:43] AAPL −0.10 σ • HOLD (conf 0.41){'\n'}
                [10:59:41] MSFT +0.08 σ • HOLD (conf 0.38){'\n'}
                [10:59:39] SPY  +0.05 σ • HOLD (conf 0.34)
              </div>
              <p className="mt-2 text-xs text-white/50">Wire this to your WebSocket feed for real data.</p>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* TRUST (generic, no broker names) */}
      <section ref={trustRef} className="relative z-10 mx-auto max-w-6xl px-6 pb-6">
        <Card className="bg-black/40 backdrop-blur border-white/10">
          <CardContent className="p-5">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div className="flex items-center gap-2 text-white/80">
                <Shield className="h-4 w-4 text-violet-300" />
                <span className="text-sm">Security first: encrypted credentials, scoped tokens, least-privilege permissions.</span>
              </div>
              <div className="flex items-center gap-3 text-xs text-white/60">
                <span className="inline-flex items-center gap-1"><Lock className="h-3.5 w-3.5" /> Data encrypted at rest & in transit</span>
                <span className="inline-flex items-center gap-1"><KeyRound className="h-3.5 w-3.5" /> OAuth/API-key flows</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </section>

      {/* FINAL CTA */}
      <section ref={ctaRef} className="relative z-10 mx-auto max-w-6xl px-6 pb-20">
        <Card className="bg-gradient-to-br from-indigo-500/15 via-violet-500/15 to-fuchsia-500/15 border-white/10">
          <CardContent className="p-8 md:p-10">
            <div className="flex flex-col items-start gap-6 md:flex-row md:items-center md:justify-between">
              <div>
                <h3 className="text-2xl font-semibold text-white">Ready to trade smarter?</h3>
                <p className="mt-1 text-white/70">Start free on paper. Upgrade to live whenever you’re ready.</p>
              </div>
              <div className="flex items-center gap-3">
                <Button asChild size="lg" className="btn-gradient">
                  <Link href="/auth">Create Account</Link>
                </Button>
                <Button asChild size="lg" variant="outline" className="border-white/15 hover:bg-white/10">
                  <Link href="/overview">Explore Features</Link>
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <p className="mt-6 text-center text-[11px] text-white/45">
          Trading involves risk. Past performance is not indicative of future results.
        </p>
      </section>

      {/* FOOTER */}
      <footer className="relative z-10 border-t border-white/10 bg-black/40 py-8">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-6 text-xs text-white/50 md:flex-row">
          <div>© {new Date().getFullYear()} Jarvis StockBot</div>
          <div className="flex items-center gap-4">
            <Link href="/settings" className="hover:text-white/80">Settings</Link>
            <Link href="/privacy" className="hover:text-white/80">Privacy</Link>
            <Link href="/disclosures" className="hover:text-white/80">Disclosures</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

/* ---------- small components ---------- */

function Feature({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) {
  return (
    <Card className="bg-black/40 backdrop-blur border-white/10 transition-transform duration-200 hover:-translate-y-0.5 hover:shadow-[0_0_0_1px_rgba(255,255,255,.06)]">
      <CardHeader className="flex-row items-center gap-3">
        <div className="inline-flex size-10 items-center justify-center rounded-md bg-white/5 ring-1 ring-white/10">{icon}</div>
        <div>
          <CardTitle className="text-white">{title}</CardTitle>
          <CardDescription className="text-white/60">{text}</CardDescription>
        </div>
      </CardHeader>
    </Card>
  );
}

function Step({ n, icon, title, text }: { n: number; icon: React.ReactNode; title: string; text: string }) {
  return (
    <Card className="bg-black/40 backdrop-blur border-white/10">
      <CardContent className="p-5">
        <div className="flex items-center gap-3">
          <div className="inline-flex size-9 items-center justify-center rounded-full bg-white/5 ring-1 ring-white/10 text-white/80">{n}</div>
          <div className="flex items-center gap-2 text-white">
            <span className="text-white/80">{icon}</span>
            <span className="font-medium">{title}</span>
          </div>
        </div>
        <p className="mt-2 text-sm text-white/60">{text}</p>
      </CardContent>
    </Card>
  );
}

function EquityPreview() {
  return (
    <div className="h-40 rounded-lg bg-black/40 ring-1 ring-white/10 grid place-items-center">
      <svg viewBox="0 0 100 40" className="w-[94%] h-[80%]" style={{ color: "#7c3aed" }}>
        <defs>
          <linearGradient id="eq" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="currentColor" stopOpacity=".5" />
            <stop offset="100%" stopColor="currentColor" stopOpacity=".05" />
          </linearGradient>
        </defs>
        <path d="M0,30 L10,28 L20,32 L30,24 L40,26 L50,18 L60,22 L70,15 L80,16 L90,8 L100,12 L100,40 L0,40 Z" fill="url(#eq)" />
        <polyline fill="none" stroke="currentColor" strokeWidth="2" points="0,30 10,28 20,32 30,24 40,26 50,18 60,22 70,15 80,16 90,8 100,12" />
      </svg>
    </div>
  );
}

function Aurora() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 -z-0">
      <div className="aurora aurora--one" />
      <div className="aurora aurora--two" />
      <div className="aurora aurora--three" />
    </div>
  );
}
