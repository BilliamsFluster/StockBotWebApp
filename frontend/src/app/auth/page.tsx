'use client';

import { useEffect, useRef, useState } from 'react';
import { gsap } from 'gsap';
import { Typewriter } from 'react-simple-typewriter';
import { LoginForm } from '@/components/Auth/LoginForm';
import { SignupForm } from '@/components/Auth/SignupForm';

export default function Auth() {
  const [isSignup, setIsSignup] = useState(false);

  // Refs for fade-in animations
  const titleRef = useRef<HTMLHeadingElement>(null);
  const descRef = useRef<HTMLParagraphElement>(null);
  const formRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Clear prior animations
    [titleRef.current, descRef.current, formRef.current].forEach(el => {
      if (el) gsap.set(el, { clearProps: 'all' });
    });

    // Fade-in animation for page content
    const tl = gsap.timeline({ defaults: { ease: 'power2.out' } });
    tl.from(titleRef.current, { autoAlpha: 0, y: 30, duration: 0.8 });
    tl.from(descRef.current,  { autoAlpha: 0, y: 20, duration: 0.8 }, '-=0.5');
    tl.from(formRef.current,  { autoAlpha: 0, y: 30, duration: 0.8 }, '-=0.5');

    // Animate the text gradient
    const span = descRef.current?.querySelector("span");
    let gradientTween: gsap.core.Tween | null = null;
    if (span) {
      gsap.set(span, {
        backgroundSize: '200% 200%',
        backgroundPosition: '0% 50%',
      });
      gradientTween = gsap.to(span, {
        backgroundPosition: '100% 50%',
        duration: 6,
        ease: 'sine.inOut',
        repeat: -1,
        yoyo: true,
      });
    }

    return () => {
      tl.kill();
      gradientTween?.kill();
    };
  }, [isSignup]);

  return (
    <div className="relative min-h-screen overflow-hidden">
      {/* REMOVED the conflicting blob divs from here */}

      {/* Layout */}
      <div className="relative grid grid-cols-1 md:grid-cols-2 h-full min-h-screen">
        {/* Left: Branding */}
        <div className="hidden md:flex flex-col items-center justify-center px-8 text-center">
          <div ref={titleRef}>
            <h1
              className="text-5xl lg:text-6xl font-extrabold
                         bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-400
                         bg-clip-text text-transparent"
            >
              Jarvis StockBot
            </h1>
          </div>
          <div ref={descRef} className="mt-4 text-xl font-medium tracking-wide min-h-[2.5rem]">
            <span
              suppressHydrationWarning
              className="bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-400
                           bg-clip-text text-transparent drop-shadow-lg"
            >
              <Typewriter
                words={[
                  'Analyzing market trends…',
                  'Learning user patterns…',
                  'Ready to assist.',
                ]}
                loop
                cursor
                cursorStyle="|"
                typeSpeed={60}
                deleteSpeed={30}
                delaySpeed={2000}
              />
            </span>
          </div>
        </div>

        {/* Right: Form */}
        <div className="flex items-center justify-center p-4 md:p-8">
          <div ref={formRef} className="w-full max-w-md">
            {isSignup
              ? <SignupForm switchToLogin={() => setIsSignup(false)} />
              : <LoginForm switchToSignup={() => setIsSignup(true)} />
            }
          </div>
        </div>
      </div>
    </div>
  );
}
