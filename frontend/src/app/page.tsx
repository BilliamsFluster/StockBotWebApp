'use client';

import { useEffect, useRef, useState } from 'react';
import { gsap } from 'gsap';
import { Typewriter } from 'react-simple-typewriter';
import LoginForm from '../components/Auth/LoginForm';
import SignupForm from '../components/Auth/SignupForm';

const Auth = () => {
  const [isSignup, setIsSignup] = useState<boolean>(false);

  const blob1Ref = useRef<HTMLDivElement | null>(null);
  const blob2Ref = useRef<HTMLDivElement | null>(null);
  const titleRef = useRef<HTMLHeadingElement | null>(null);
  const descRef = useRef<HTMLParagraphElement | null>(null);

  useEffect(() => {
    if (!titleRef.current || !descRef.current || !blob1Ref.current || !blob2Ref.current) return;

    gsap.set(titleRef.current, { opacity: 0, y: 20 });
    gsap.set(descRef.current, { opacity: 0, y: 20 });

    gsap.to(titleRef.current, {
      opacity: 1,
      y: 0,
      duration: 1,
      ease: 'power2.out',
      delay: 0.2,
    });

    gsap.to(descRef.current, {
      opacity: 1,
      y: 0,
      duration: 1,
      ease: 'power2.out',
      delay: 0.5,
    });

    gsap.to(blob1Ref.current, {
      x: 30,
      y: -20,
      duration: 10,
      repeat: -1,
      yoyo: true,
      ease: 'sine.inOut',
    });

    gsap.to(blob2Ref.current, {
      x: -25,
      y: 25,
      duration: 12,
      repeat: -1,
      yoyo: true,
      ease: 'sine.inOut',
    });
  }, []);

  return (
    <div className="min-h-screen bg-base-100 flex flex-col md:flex-row relative overflow-hidden items-center justify-center px-6">
      {/* Ambient Blobs */}
      <div
        ref={blob1Ref}
        className="absolute w-96 h-96 bg-primary/20 rounded-full blur-3xl top-10 left-10"
      />
      <div
        ref={blob2Ref}
        className="absolute w-80 h-80 bg-secondary/20 rounded-full blur-2xl bottom-20 right-20"
      />

      {/* Layout Container */}
      <div className="flex flex-col-reverse md:flex-row gap-8 items-center justify-center w-full max-w-6xl z-10">
        {/* Branding */}
        <div className="text-white max-w-md text-center md:text-left z-20">
          <h1 ref={titleRef} className="text-5xl font-bold">
            Jarvis StockBot
          </h1>
          <p ref={descRef} className="text-lg mt-6 min-h-[2.5rem]">
            <Typewriter
              words={[
                'Analyzing market trends...',
                'Learning user patterns...',
                'Ready to assist.',
              ]}
              loop
              cursor
              cursorStyle="|"
              typeSpeed={40}
              deleteSpeed={20}
              delaySpeed={2500}
            />
          </p>
        </div>

        {/* Form */}
        <div className="card w-full max-w-md shadow-xl bg-base-200">
          <div className="card-body">
            <h2 className="card-title justify-center text-2xl">
              {isSignup ? 'Create Account' : 'Welcome Back'}
            </h2>

            {isSignup ? <SignupForm switchToLogin={() => setIsSignup(false)} /> : <LoginForm />}


            <div className="mt-4 text-center">
              {isSignup ? 'Already have an account?' : 'New here?'}{' '}
              <button
                onClick={() => setIsSignup(!isSignup)}
                className="link link-primary"
              >
                {isSignup ? 'Login' : 'Sign up'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Auth;
