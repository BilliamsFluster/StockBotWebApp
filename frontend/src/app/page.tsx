'use client';

import { useEffect, useRef } from 'react';
import Link from 'next/link';
import { gsap } from 'gsap';
import { Typewriter } from 'react-simple-typewriter';
import { FaRobot, FaChartLine, FaShieldAlt } from 'react-icons/fa';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function Page() {
  const titleRef = useRef<HTMLHeadingElement>(null);
  const subtitleRef = useRef<HTMLParagraphElement>(null);
  const featuresRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const tl = gsap.timeline({ defaults: { ease: 'power2.out' } });
    tl.fromTo(titleRef.current, { opacity: 0, y: 30 }, { opacity: 1, y: 0, duration: 1 });
    tl.fromTo(subtitleRef.current, { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 1 }, '-=0.6');
    
    if (featuresRef.current) {
      gsap.fromTo(
        featuresRef.current.children,
        { opacity: 0, y: 50 },
        {
          opacity: 1,
          y: 0,
          duration: 0.8,
          stagger: 0.2,
          scrollTrigger: {
            trigger: featuresRef.current,
            start: 'top 80%',
          },
        }
      );
    }
  }, []);

  return (
    // The blob divs have been removed from here
    <div className="w-full">
      {/* Hero Section */}
      <section className="min-h-[90vh] flex flex-col items-center justify-center text-center px-6">
        <h1
          ref={titleRef}
          className="text-5xl md:text-7xl font-bold bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-400 bg-clip-text text-transparent"
        >
          Jarvis StockBot
        </h1>
        <p
          ref={subtitleRef}
          className="mt-6 text-xl md:text-2xl text-muted-foreground max-w-xl"
        >
          <Typewriter
            words={[
              'Smarter trading decisions.',
              'AI-powered financial insight.',
              'Zero guesswork. Full control.',
            ]}
            loop
            cursor
            cursorStyle="_"
            typeSpeed={40}
            deleteSpeed={30}
            delaySpeed={1500}
          />
        </p>
        <Button asChild size="lg" className="mt-10 btn-gradient">
          <Link href="/auth">Get Started</Link>
        </Button>
      </section>

      {/* Features */}
      <section className="py-20 px-6 max-w-6xl mx-auto">
        <h2 className="text-4xl font-bold text-center mb-12">What You Get</h2>
        <div ref={featuresRef} className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {/* Removed "gradient-ring" from all cards */}
          <Card className="ink-card">
            <CardHeader className="items-center text-center">
              <FaChartLine className="text-4xl text-indigo-400 mb-4" />
              <CardTitle>Live Market Analytics</CardTitle>
            </CardHeader>
            <CardContent className="text-center text-muted-foreground">
              Access live data and spot trends as they happen.
            </CardContent>
          </Card>

          <Card className="ink-card">
            <CardHeader className="items-center text-center">
              <FaRobot className="text-4xl text-purple-400 mb-4" />
              <CardTitle>AI Trading Support</CardTitle>
            </CardHeader>
            <CardContent className="text-center text-muted-foreground">
              Make informed trades with real-time LLM guidance.
            </CardContent>
          </Card>

          <Card className="ink-card">
            <CardHeader className="items-center text-center">
              <FaShieldAlt className="text-4xl text-pink-400 mb-4" />
              <CardTitle>Data Security</CardTitle>
            </CardHeader>
            <CardContent className="text-center text-muted-foreground">
              Your financial data is encrypted and stored securely.
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-6 text-center text-sm text-muted-foreground">
        &copy; {new Date().getFullYear()} Jarvis StockBot. All rights reserved.
      </footer>
    </div>
  );
}
