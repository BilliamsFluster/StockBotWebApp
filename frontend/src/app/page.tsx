'use client';

import { useEffect, useRef, useState } from 'react';
import { gsap } from 'gsap';
import { Typewriter } from 'react-simple-typewriter';
import LoginForm from '@/components/Auth/LoginForm';
import SignupForm from '@/components/Auth/SignupForm';

export default function Auth() {
  const [isSignup, setIsSignup] = useState(false);

  const blob1Ref = useRef<HTMLDivElement>(null);
  const blob2Ref = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const descRef = useRef<HTMLParagraphElement>(null);
  const formRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Clear prior animations
    [titleRef.current, descRef.current, formRef.current, blob1Ref.current, blob2Ref.current].forEach(el => {
      if (el) gsap.set(el, { clearProps: 'all' });
    });

    // Fade-in animation
    const tl = gsap.timeline({ defaults: { ease: 'power2.out' } });
    tl.from(titleRef.current, { autoAlpha: 0, y: 30, duration: 0.8 });
    tl.from(descRef.current,  { autoAlpha: 0, y: 20, duration: 0.8 }, '-=0.5');
    tl.from(formRef.current,  { autoAlpha: 0, y: 30, duration: 0.8 }, '-=0.5');

    // Blob movement
    const blob1Tween = gsap.to(blob1Ref.current, {
      x: 50, y: -50, duration: 12, repeat: -1, yoyo: true, ease: 'sine.inOut',
    });
    const blob2Tween = gsap.to(blob2Ref.current, {
      x: -50, y: 50, duration: 14, repeat: -1, yoyo: true, ease: 'sine.inOut',
    });

    // Animate the background gradient
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
      blob1Tween.kill();
      blob2Tween.kill();
      gradientTween?.kill();
    };
  }, [isSignup]);

  return (
    <div
      className="relative h-screen overflow-hidden"
      style={{
        background: 'radial-gradient(circle at top left, #1f1f2e 0%, #0d0d12 100%)',
      }}
    >
      {/* Background Blobs */}
      <div
        ref={blob1Ref}
        className="absolute -top-24 -left-24 w-80 h-80 bg-purple-600/20 rounded-full blur-2xl pointer-events-none"
      />
      <div
        ref={blob2Ref}
        className="absolute -bottom-24 -right-24 w-96 h-96 bg-pink-600/20 rounded-full blur-3xl pointer-events-none"
      />

      {/* Layout */}
      <div className="grid grid-cols-1 md:grid-cols-2 h-full">
        {/* Left: Branding */}
        <div className="flex items-center justify-center px-8">
          <div className="text-center md:text-left">
            <h1
              ref={titleRef}
              className="text-4xl md:text-5xl lg:text-6xl font-extrabold
                         bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-400
                         bg-clip-text text-transparent"
            >
              Jarvis StockBot
            </h1>

            <p
              ref={descRef}
              className="mt-4 text-lg md:text-xl font-medium tracking-wide min-h-[2.5rem]"
            >
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
            </p>
          </div>
        </div>

        {/* Right: Form */}
        <div className="flex items-center justify-center px-8">
          <div
            ref={formRef}
            className="w-full max-w-md bg-gray-800 bg-opacity-70 backdrop-blur-md 
                       rounded-xl shadow-xl p-8"
          >
            <h2 className="text-2xl font-semibold text-white text-center mb-6">
              {isSignup ? 'Create Account' : 'Welcome Back'}
            </h2>

            {isSignup
              ? <SignupForm switchToLogin={() => setIsSignup(false)} />
              : <LoginForm />
            }

            <div className="mt-4 text-center text-gray-400">
              {isSignup ? 'Already have an account? ' : 'New here? '}
              <button
                onClick={() => setIsSignup(!isSignup)}
                className="text-indigo-300 hover:text-indigo-100"
              >
                {isSignup ? 'Login' : 'Sign up'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
