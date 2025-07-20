'use client';

import { useEffect, useRef, useState } from 'react';
import { gsap } from 'gsap';
import { FaUserCircle } from 'react-icons/fa';
import ProfilePanel from '../../components/ProfilePanel';

export default function Home() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const blob1Ref = useRef<HTMLDivElement | null>(null);
  const blob2Ref = useRef<HTMLDivElement | null>(null);
  const blob3Ref = useRef<HTMLDivElement | null>(null);
  const profileToggleRef = useRef<HTMLDivElement | null>(null);
  const profilePanelRef = useRef<HTMLDivElement | null>(null);

  const [darkMode, setDarkMode] = useState<boolean>(true);
  const [voiceEnabled, setVoiceEnabled] = useState<boolean>(false);
  const [model, setModel] = useState<string>('GPT-4');
  const [profileOpen, setProfileOpen] = useState<boolean>(false);
  const [username, setUsername] = useState<string>('User');

  useEffect(() => {
    const tl = gsap.timeline({ defaults: { ease: 'power3.out' } });
    tl.fromTo('#jarvis-title', { opacity: 0, y: 50 }, { opacity: 1, y: 0, duration: 1.2 })
      .fromTo('#jarvis-sub', { opacity: 0, y: 30 }, { opacity: 1, y: 0, duration: 1 }, '-=0.8')
      .fromTo('#jarvis-actions', { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.6 }, '-=0.6')
      .fromTo('#main-layout', { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 1 }, '-=0.4');

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

    gsap.to(blob3Ref.current, {
      x: 20,
      y: 20,
      duration: 8,
      repeat: -1,
      yoyo: true,
      ease: 'sine.inOut',
    });

    // Fetch user
    const token = localStorage.getItem('token');
    if (token) {
      fetch('/api/user/me', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })
        .then((res) => res.json())
        .then((data) => {
          if (data?.username) setUsername(data.username);
        })
        .catch(() => {});
    }
  }, []);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
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

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [profileOpen]);

  return (
    <div
      ref={containerRef}
      className={`relative flex flex-col min-h-screen px-4 py-10 overflow-hidden ${
        darkMode ? 'bg-base-100 text-base-content' : 'bg-white text-black'
      }`}
    >
      {/* Animated Background Blobs */}
      <div className="absolute -z-10 w-full h-full overflow-hidden">
        <div
          ref={blob1Ref}
          className="absolute top-1/4 left-1/3 w-96 h-96 bg-primary/20 rounded-full blur-3xl"
        />
        <div
          ref={blob2Ref}
          className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-secondary/20 rounded-full blur-2xl"
        />
        <div
          ref={blob3Ref}
          className="absolute top-0 right-1/2 w-64 h-64 bg-accent/10 rounded-full blur-2xl"
        />
      </div>

      {/* Profile Section */}
      <div ref={profileToggleRef} className="absolute top-4 right-6 z-10 flex items-center gap-3">
        <span className="font-semibold">Welcome, {username}</span>
        <button onClick={() => setProfileOpen(true)}>
          <FaUserCircle className="text-3xl" />
        </button>
      </div>

      <div ref={profilePanelRef}>
        <ProfilePanel
          isOpen={profileOpen}
          onClose={() => setProfileOpen(false)}
          darkMode={darkMode}
          setDarkMode={setDarkMode}
        />
      </div>

      {/* Header */}
      <div className="text-center">
        <h1 id="jarvis-title" className="text-5xl md:text-6xl font-bold text-primary">
          Jarvis
        </h1>
        <p id="jarvis-sub" className="text-lg md:text-xl text-secondary mt-4 max-w-3xl mx-auto">
          Your AI-powered market strategist. Ask anything, get real-time financial insight.
        </p>
        <div id="jarvis-actions" className="flex flex-col md:flex-row gap-4 mt-6 justify-center">
          <button className="btn btn-primary" onClick={() => setVoiceEnabled(!voiceEnabled)}>
            {voiceEnabled ? 'Disable Voice Mode' : 'Launch Voice Mode'}
          </button>
          <button className="btn btn-outline btn-secondary">Type Your Prompt</button>
        </div>
      </div>

      {/* Main Layout */}
      <div id="main-layout" className="flex flex-1 w-full gap-4 mt-10 max-w-[1440px] mx-auto">
        {/* Left Panel */}
        <div className="w-1/5 bg-base-200 rounded-xl shadow-md p-4 space-y-4 hidden lg:block">
          <h2 className="text-lg font-semibold">Options</h2>
          <div className="form-control">
            <label className="cursor-pointer label justify-between">
              <span>Dark Mode</span>
              <input
                type="checkbox"
                className="toggle toggle-sm"
                checked={darkMode}
                onChange={() => setDarkMode(!darkMode)}
              />
            </label>
          </div>
          <div className="form-control">
            <label className="cursor-pointer label justify-between">
              <span>Voice Enabled</span>
              <input
                type="checkbox"
                className="toggle toggle-sm"
                checked={voiceEnabled}
                onChange={() => setVoiceEnabled(!voiceEnabled)}
              />
            </label>
          </div>
          <div className="form-control">
            <label className="label">
              <span className="label-text">Model</span>
            </label>
            <select
              className="select select-bordered select-sm w-full"
              value={model}
              onChange={(e) => setModel(e.target.value)}
            >
              <option>GPT-4</option>
              <option>GPT-3.5</option>
            </select>
          </div>
        </div>

        {/* Center - Chat Box */}
        <div className="flex-1 bg-base-200 rounded-xl shadow-md p-6 flex flex-col">
          <div className="flex-1 overflow-y-auto space-y-4 bg-base-100 rounded p-4">
            <div className="chat chat-start">
              <div className="chat-bubble">What’s the market outlook today?</div>
            </div>
            <div className="chat chat-end">
              <div className="chat-bubble chat-bubble-primary">
                NASDAQ is up 1.2%. Tech stocks are surging due to better-than-expected earnings.
              </div>
            </div>
          </div>
          <div className="mt-4 flex items-center gap-2">
            <input
              type="text"
              placeholder="Type your question..."
              className="input input-bordered w-full"
            />
            <button className="btn btn-primary">Send</button>
          </div>

          {voiceEnabled && (
            <div className="mt-6 h-12 flex items-center gap-2">
              {[...Array(5)].map((_, i) => (
                <div
                  key={i}
                  className="w-2 bg-primary animate-pulse"
                  style={{ height: `${Math.random() * 40 + 10}px` }}
                />
              ))}
            </div>
          )}
        </div>

        {/* Right Panel */}
        <div className="w-1/5 bg-base-200 rounded-xl shadow-md p-4 space-y-4 hidden lg:block">
          <h2 className="text-lg font-semibold">Market Snapshot</h2>
          <ul className="space-y-2 text-sm">
            <li>📈 NASDAQ: <span className="text-success">+1.2%</span></li>
            <li>📉 S&P 500: <span className="text-error">-0.4%</span></li>
            <li>💹 DOW JONES: +0.8%</li>
            <li>💰 BTC: $41,200</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
