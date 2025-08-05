'use client';

import { useEffect, useRef, useState } from 'react';
import { gsap } from 'gsap';
import { FaUserCircle } from 'react-icons/fa';
import ProfilePanel from '@/components/ProfilePanel';
import JarvisPanel from '@/components/Jarvis/JarvisPanel';
import { useWarmPortfolioData } from '@/hooks/useWarmPortfolioData';


export default function Chatbot() {
  useWarmPortfolioData()
  
  
  const containerRef     = useRef<HTMLDivElement>(null);
  const blob1Ref         = useRef<HTMLDivElement>(null);
  const blob2Ref         = useRef<HTMLDivElement>(null);
  const blob3Ref         = useRef<HTMLDivElement>(null);
  const profileToggleRef = useRef<HTMLDivElement>(null);
  const profilePanelRef  = useRef<HTMLDivElement>(null);

  const [darkMode, setDarkMode]         = useState(true);
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const [profileOpen, setProfileOpen]   = useState(false);
  const [username, setUsername]         = useState('User');

  useEffect(() => {
    // Animations
    const tl = gsap.timeline({ defaults: { ease: 'power3.out' } });
    tl.fromTo('#jarvis-title',   { opacity: 0, y: 50 }, { opacity: 1, y: 0, duration: 1.2 })
      .fromTo('#jarvis-sub',     { opacity: 0, y: 30 }, { opacity: 1, y: 0, duration: 1   }, '-=0.8')
      .fromTo('#jarvis-actions', { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.6 }, '-=0.6')
      .fromTo('#main-layout',    { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 1   }, '-=0.4');

    gsap.to(blob1Ref.current, { x: 50, y: -30, duration: 10, repeat: -1, yoyo: true, ease: 'sine.inOut' });
    gsap.to(blob2Ref.current, { x: -50, y: 30, duration: 12, repeat: -1, yoyo: true, ease: 'sine.inOut' });
    gsap.to(blob3Ref.current, { x: 40, y: 40, duration: 8, repeat: -1, yoyo: true, ease: 'sine.inOut' });

    // Secure cookie-based profile fetch
    fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/users/profile`, {
      credentials: 'include', // send HTTP-only cookie
    })
      .then((r) => {
        if (!r.ok) throw new Error('Not authenticated');
        return r.json();
      })
      .then((data) => {
        if (data.username) setUsername(data.username);
      })
      .catch(() => {
        setUsername('Guest');
      });
  }, []);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (
        profileOpen &&
        profilePanelRef.current &&
        !profilePanelRef.current.contains(e.target as Node) &&
        profileToggleRef.current &&
        !profileToggleRef.current.contains(e.target as Node)
      ) {
        setProfileOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [profileOpen]);

  return (
    <div
      ref={containerRef}
      className="
        relative flex flex-col
        px-4 pt-4 pb-2
        min-h-screen
        overflow-x-hidden
        bg-[radial-gradient(circle_at_top_left,_#1f1f2e,_#0d0d12)]
        text-neutral-200
      "
    >
      {/* ─── Blobs ───────────────────────── */}
      <div className="absolute inset-0 pointer-events-none z-0">
        <div
          ref={blob1Ref}
          className="absolute top-10 left-10 w-96 h-96 bg-purple-600/20 rounded-full blur-3xl"
        />
        <div
          ref={blob2Ref}
          className="absolute bottom-10 right-10 w-80 h-80 bg-pink-600/20 rounded-full blur-2xl"
        />
        <div
          ref={blob3Ref}
          className="absolute top-4 right-4 w-64 h-64 bg-indigo-600/10 rounded-full blur-2xl"
        />
      </div>

      {/* ─── Profile toggle ─────────────────── */}
      <div
        ref={profileToggleRef}
        className="absolute top-2 right-4 z-20 flex items-center gap-2"
      >
        <span className="font-semibold">Welcome, {username}</span>
        <button aria-label="Open profile" onClick={() => setProfileOpen(true)}>
          <FaUserCircle className="text-3xl" />
        </button>
      </div>

      {/* ─── Profile panel ──────────────────── */}
      <div ref={profilePanelRef}>
        <ProfilePanel
          isOpen={profileOpen}
          onClose={() => setProfileOpen(false)}
          darkMode={darkMode}
          setDarkMode={setDarkMode}
        />
      </div>

      {/* ─── Main ───────────────────────────── */}
      <div className="flex-1 overflow-y-auto pt-16" id="main-layout">
        <div className="text-center">
          <h1 id="jarvis-title" className="text-5xl md:text-6xl font-bold bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
            Jarvis
          </h1>
          <p
            id="jarvis-sub"
            className="text-lg md:text-xl text-neutral-400 mt-4 max-w-3xl mx-auto"
          >
            Your AI-powered market strategist. Ask anything, get real-time financial insight.
          </p>
          <div
            id="jarvis-actions"
            className="flex flex-col md:flex-row gap-4 mt-6 justify-center"
          >
            <button
              className="btn btn-primary"
              onClick={() => setVoiceEnabled((v) => !v)}
            >
              {voiceEnabled ? 'Disable Voice Mode' : 'Launch Voice Mode'}
            </button>
            <button
              className="btn btn-outline btn-secondary"
              onClick={() =>
                document.getElementById('jarvis-panel')?.scrollIntoView({ behavior: 'smooth' })
              }
            >
              Type Your Prompt
            </button>
          </div>
        </div>

        <div id="jarvis-panel" className="mt-8 max-w-5xl w-full mx-auto">
          <JarvisPanel />
        </div>
      </div>
    </div>
  );
}
