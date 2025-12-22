"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  ArrowUpRight,
  Bot,
  Cpu,
  Layers,
  LineChart,
  Sparkles,
  Star,
  Terminal,
  Workflow,
} from "lucide-react";

const highlights = [
  {
    title: "AI-driven product experiences",
    description: "Human-first UX paired with real-time signals, automation, and guardrails.",
    icon: <Sparkles className="h-5 w-5 text-violet-300" />,
  },
  {
    title: "Reactive, motion-forward interfaces",
    description: "GSAP micro-interactions, smooth scroll stories, and kinetic layouts.",
    icon: <Workflow className="h-5 w-5 text-indigo-300" />,
  },
  {
    title: "Modular front-end systems",
    description: "Tailwind + shadcn components built for velocity and consistency.",
    icon: <Layers className="h-5 w-5 text-fuchsia-300" />,
  },
];

const featuredWork = [
  {
    title: "Signal Desk",
    description: "A real-time trading cockpit with chart overlays, alerts, and position routing.",
    tags: ["Dashboard", "Realtime", "Design"],
  },
  {
    title: "Atlas Backtester",
    description: "Scenario-driven backtests with Monte Carlo variance maps and exportable reports.",
    tags: ["Analytics", "Data Viz", "Research"],
  },
  {
    title: "BWA Studio",
    description: "A sleek marketing site with cinematic motion and clear conversion paths.",
    tags: ["Brand", "Landing", "GSAP"],
  },
];

const stack = [
  { label: "React + Router", icon: <Bot className="h-4 w-4" /> },
  { label: "GSAP + ScrollTrigger", icon: <Star className="h-4 w-4" /> },
  { label: "Tailwind + shadcn/ui", icon: <Layers className="h-4 w-4" /> },
  { label: "Realtime APIs", icon: <Terminal className="h-4 w-4" /> },
  { label: "AI Pipelines", icon: <Cpu className="h-4 w-4" /> },
  { label: "Market Analytics", icon: <LineChart className="h-4 w-4" /> },
];

export default function LandingPage() {
  const heroRef = useRef<HTMLDivElement>(null);
  const sectionRefs = useRef<HTMLElement[]>([]);

  const registerSection = (el: HTMLElement | null) => {
    if (el && !sectionRefs.current.includes(el)) {
      sectionRefs.current.push(el);
    }
  };

  useEffect(() => {
    gsap.registerPlugin(ScrollTrigger);
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) return;

    if (heroRef.current) {
      gsap.fromTo(
        heroRef.current,
        { opacity: 0, y: 35 },
        { opacity: 1, y: 0, duration: 0.8, ease: "power2.out" }
      );
    }

    sectionRefs.current.forEach((section, index) => {
      gsap.fromTo(
        section,
        { opacity: 0, y: 30 },
        {
          opacity: 1,
          y: 0,
          duration: 0.7,
          ease: "power2.out",
          delay: index * 0.05,
          scrollTrigger: { trigger: section, start: "top 85%", once: true },
        }
      );
    });

    return () => ScrollTrigger.getAll().forEach((trigger) => trigger.kill());
  }, []);

  return (
    <div className="relative w-full overflow-hidden">
      <Aurora />

      <header className="relative z-10 mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <Link href="/" className="flex items-center gap-2">
          <span className="inline-flex size-9 items-center justify-center rounded-md bg-white/5 ring-1 ring-white/10">
            <Bot className="h-4 w-4 text-white/90" />
          </span>
          <span className="text-lg font-semibold tracking-tight bg-gradient-to-r from-indigo-300 via-violet-300 to-fuchsia-300 bg-clip-text text-transparent">
            BWA Studio
          </span>
        </Link>
        <nav className="hidden items-center gap-5 text-sm text-white/70 md:flex">
          <a href="#work" className="hover:text-white">Work</a>
          <a href="#process" className="hover:text-white">Process</a>
          <a href="#stack" className="hover:text-white">Stack</a>
          <a href="#contact" className="hover:text-white">Contact</a>
        </nav>
        <Button asChild className="btn-gradient">
          <Link href="/auth">Launch Demo</Link>
        </Button>
      </header>

      <section ref={heroRef} className="relative z-10 mx-auto grid max-w-6xl gap-10 px-6 pb-16 pt-8 md:grid-cols-[1.2fr_0.8fr] md:items-center md:pb-24">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/70">
            <span className="inline-flex items-center gap-1"><Sparkles className="h-3.5 w-3.5 text-fuchsia-300" /> Rebuilt from the original BWA</span>
            <span className="text-white/40">•</span>
            <span>React + GSAP + shadcn</span>
          </div>
          <h1 className="mt-6 text-5xl font-semibold leading-tight tracking-tight text-white md:text-6xl [font-family:var(--font-display)]">
            Crafting trading-first web experiences with cinematic motion.
          </h1>
          <p className="mt-4 max-w-xl text-lg text-white/70">
            BWA Studio blends product design, market intelligence, and kinetic storytelling to launch bold fintech experiences.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Button asChild size="lg" className="btn-gradient">
              <a href="#work">View Selected Work</a>
            </Button>
            <Button asChild size="lg" variant="outline" className="border-white/15 hover:bg-white/10">
              <a href="#contact">Book a Call</a>
            </Button>
            <span className="text-xs text-white/50">Available for Q4 collaborations</span>
          </div>
        </div>
        <Card className="gradient-border bg-black/40 backdrop-blur">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <LineChart className="h-4 w-4 text-indigo-300" /> Live product snapshot
            </CardTitle>
            <CardDescription>Realtime systems, polished UI, and crisp narrative.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {[
              { label: "Signal throughput", value: "18.2k/min" },
              { label: "Average latency", value: "110ms" },
              { label: "Active research modules", value: "24" },
            ].map((item) => (
              <div key={item.label} className="flex items-center justify-between rounded-lg border border-white/10 bg-black/40 px-4 py-3 text-sm text-white/80">
                <span>{item.label}</span>
                <span className="font-semibold text-white">{item.value}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      </section>

      <section ref={registerSection} className="relative z-10 mx-auto max-w-6xl px-6 pb-14" id="work">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-3xl font-semibold text-white">Selected work</h2>
            <p className="mt-2 text-white/60">Product stories rebuilt with motion, clarity, and edge.</p>
          </div>
          <Button variant="outline" className="border-white/15 text-white/80 hover:bg-white/10">
            View archive
          </Button>
        </div>
        <div className="mt-8 grid gap-6 md:grid-cols-3">
          {featuredWork.map((item) => (
            <Card key={item.title} className="bg-black/40 backdrop-blur border-white/10">
              <CardHeader>
                <CardTitle>{item.title}</CardTitle>
                <CardDescription>{item.description}</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-2">
                {item.tags.map((tag) => (
                  <Badge key={tag} variant="outline" className="border-white/15 text-white/70">
                    {tag}
                  </Badge>
                ))}
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <section ref={registerSection} className="relative z-10 mx-auto max-w-6xl px-6 pb-14" id="process">
        <div className="grid gap-6 md:grid-cols-[1fr_1.2fr]">
          <div>
            <h2 className="text-3xl font-semibold text-white">Build with momentum</h2>
            <p className="mt-3 text-white/60">
              A collaborative sprint cadence that moves from strategy to motion in weeks.
            </p>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {highlights.map((item) => (
              <Card key={item.title} className="bg-black/40 backdrop-blur border-white/10">
                <CardHeader className="flex-row items-start gap-3">
                  <div className="inline-flex size-10 items-center justify-center rounded-md bg-white/5 ring-1 ring-white/10">
                    {item.icon}
                  </div>
                  <div>
                    <CardTitle className="text-white">{item.title}</CardTitle>
                    <CardDescription className="text-white/60">{item.description}</CardDescription>
                  </div>
                </CardHeader>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section ref={registerSection} className="relative z-10 mx-auto max-w-6xl px-6 pb-16" id="stack">
        <Card className="bg-black/40 backdrop-blur border-white/10">
          <CardContent className="p-6 md:p-8">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <h2 className="text-2xl font-semibold text-white">Stack & capability</h2>
                <p className="text-white/60">The exact tools that powered the original BWA build.</p>
              </div>
              <Button asChild className="btn-gradient">
                <a href="#contact">Start a project</a>
              </Button>
            </div>
            <div className="mt-6 grid gap-3 sm:grid-cols-2 md:grid-cols-3">
              {stack.map((item) => (
                <div key={item.label} className="flex items-center gap-3 rounded-lg border border-white/10 bg-black/40 px-4 py-3 text-sm text-white/70">
                  <span className="text-white/80">{item.icon}</span>
                  <span>{item.label}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </section>

      <section ref={registerSection} className="relative z-10 mx-auto max-w-6xl px-6 pb-20" id="contact">
        <Card className="bg-gradient-to-br from-indigo-500/15 via-violet-500/15 to-fuchsia-500/15 border-white/10">
          <CardContent className="p-8 md:p-10">
            <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
              <div>
                <h2 className="text-3xl font-semibold text-white">Let’s rebuild the rest.</h2>
                <p className="mt-2 text-white/70">
                  Share a brief, grab a slot, and we’ll rebuild the original experience with modern polish.
                </p>
              </div>
              <div className="flex items-center gap-3">
                <Button asChild size="lg" className="btn-gradient">
                  <a href="mailto:hello@bwa.studio">Email hello@bwa.studio</a>
                </Button>
                <Button asChild size="lg" variant="outline" className="border-white/15 hover:bg-white/10">
                  <a href="#work" className="flex items-center gap-2">
                    View work <ArrowUpRight className="h-4 w-4" />
                  </a>
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </section>

      <footer className="relative z-10 border-t border-white/10 bg-black/40 py-8">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-6 text-xs text-white/50 md:flex-row">
          <div>© {new Date().getFullYear()} BWA Studio</div>
          <div className="flex items-center gap-4">
            <span>Built with React, GSAP, Tailwind, shadcn/ui</span>
          </div>
        </div>
      </footer>
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
