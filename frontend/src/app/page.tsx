'use client';

import { useEffect, useRef } from 'react';
import { gsap } from 'gsap';
import { Typewriter } from 'react-simple-typewriter';
import { FaRobot, FaChartLine, FaShieldAlt } from 'react-icons/fa';

export default function Page() {
  const titleRef = useRef<HTMLHeadingElement>(null);
  const subtitleRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    const tl = gsap.timeline({ defaults: { ease: 'power2.out' } });
    tl.fromTo(titleRef.current, { opacity: 0, y: 30 }, { opacity: 1, y: 0, duration: 1 });
    tl.fromTo(subtitleRef.current, { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 1 }, '-=0.6');
  }, []);

  return (
    <div className="bg-base-200 text-white">
      {/* Hero Section */}
      <section className="min-h-[90vh] flex flex-col items-center justify-center text-center px-6">
        <h1
          ref={titleRef}
          className="text-5xl md:text-6xl font-bold bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-400 bg-clip-text text-transparent"
        >
          Jarvis StockBot
        </h1>
        <p
          ref={subtitleRef}
          className="mt-6 text-xl md:text-2xl text-gray-300 max-w-xl"
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
        <a
          href="/auth"
          className="btn btn-primary mt-10 px-6 bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 text-white border-none hover:scale-105 transition-transform"
        >
          Get Started
        </a>
      </section>

      {/* Features */}
      <section className="py-20 px-6 max-w-6xl mx-auto">
        <h2 className="text-3xl font-bold text-center mb-12">What You Get</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-8">
          <div className="card bg-base-100 border border-base-300 shadow-xl hover:shadow-2xl transition-shadow">
            <div className="card-body items-center text-center">
              <FaChartLine className="text-4xl text-indigo-400 mb-4" />
              <h3 className="card-title">Live Market Analytics</h3>
              <p className="text-gray-400">Access live data and spot trends as they happen.</p>
            </div>
          </div>

          <div className="card bg-base-100 border border-base-300 shadow-xl hover:shadow-2xl transition-shadow">
            <div className="card-body items-center text-center">
              <FaRobot className="text-4xl text-purple-400 mb-4" />
              <h3 className="card-title">AI Trading Support</h3>
              <p className="text-gray-400">Make informed trades with real-time LLM guidance.</p>
            </div>
          </div>

          <div className="card bg-base-100 border border-base-300 shadow-xl hover:shadow-2xl transition-shadow">
            <div className="card-body items-center text-center">
              <FaShieldAlt className="text-4xl text-pink-400 mb-4" />
              <h3 className="card-title">Data Security</h3>
              <p className="text-gray-400">Your financial data is encrypted and stored securely.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Optional CTA Section */}
      <section className="py-16 bg-base-300 text-center">
        <h2 className="text-2xl font-semibold mb-4">Start Automating Your Trades Today</h2>
        <a
          href="/auth"
          className="btn btn-accent px-8 text-white hover:scale-105 transition-transform"
        >
          Launch Now
        </a>
      </section>

      {/* Footer */}
      <footer className="py-6 text-center text-sm text-gray-500">
        &copy; {new Date().getFullYear()} Jarvis StockBot. All rights reserved.
        <div className="mt-2 space-x-4">
          <a href="/privacy" className="hover:text-white">Privacy</a>
          <a href="/terms" className="hover:text-white">Terms</a>
          <a href="/contact" className="hover:text-white">Contact</a>
        </div>
      </footer>
    </div>
  );
}
