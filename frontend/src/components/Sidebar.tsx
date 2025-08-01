'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, useRef, useEffect } from 'react';
import clsx from 'clsx';
import {
  FaRobot,
  FaChartPie,
  FaHistory,
  FaTable,
  FaCog,
  FaUser,
} from 'react-icons/fa';

import SchwabAuth from '@/components/Auth/SchwabAuth';
import { useSchwabStatus } from '@/hooks/useSchwabStatus';

interface SidebarProps {
  isMobileOpen: boolean;
  setMobileOpen: React.Dispatch<React.SetStateAction<boolean>>;
}

const navSections = [
  {
    title: 'Assistant',
    links: [
      { href: '/chatbot', icon: <FaRobot />, label: 'Jarvis Chat' },
      { href: '/insights', icon: <FaChartPie />, label: 'AI Insights' },
    ],
  },
  {
    title: 'Portfolio',
    links: [
      { href: '/portfolio', icon: <FaChartPie />, label: 'Dashboard' },
      { href: '/portfolio/positions', icon: <FaTable />, label: 'Holdings' },
      { href: '/portfolio/trades', icon: <FaHistory />, label: 'Trade History' },
      { href: '/portfolio/transactions', icon: <FaTable />, label: 'Transactions' },
      { href: '/stockbot', icon: <FaTable />, label: 'Stockbot' },
    ],
  },
  {
    title: 'System',
    links: [
      { href: '/settings', icon: <FaCog />, label: 'Settings' },
      { href: '/account', icon: <FaUser />, label: 'Account' },
    ],
  },
];

export default function Sidebar({ isMobileOpen, setMobileOpen }: SidebarProps) {
  const pathname = usePathname();
  const [expanded, setExpanded] = useState(true);
  const [authOpen, setAuthOpen] = useState(false);
  const isConnectedToSchwab = useSchwabStatus();
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (authOpen && dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setAuthOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [authOpen]);

  // Always expanded on mobile
  useEffect(() => {
    if (window.innerWidth < 1024) {
      setExpanded(true);
    }
  }, []);

  const handleLinkClick = () => {
    if (window.innerWidth < 1024) {
      setMobileOpen(false);
    }
  };

  return (
    <aside
      className={clsx(
        'h-screen fixed top-0 left-0 z-50 bg-black/20 backdrop-blur-lg border-r border-purple-400/20',
        'transition-all duration-300 overflow-visible', // allow dropdown to show outside
        'w-64',
        expanded ? 'lg:w-64' : 'lg:w-20',
        isMobileOpen ? 'translate-x-0' : '-translate-x-full',
        'lg:translate-x-0'
      )}
    >
      {/* Header: Logo and Schwab Connection */}
      <div className="relative flex items-center justify-between px-4 py-4">
        {/* Logo or Title */}
        <div
          className="flex items-center gap-2 cursor-pointer"
          onClick={() => {
            if (window.innerWidth >= 1024) {
              setExpanded(!expanded);
            }
          }}
        >
          {expanded ? (
            <span className="text-3xl font-extrabold bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
              Jarvis
            </span>
          ) : (
            <div className="w-10 h-10">
              <img
                src="/BotLogo.png"
                alt="Jarvis Logo"
                className="w-full h-full object-contain invert brightness-200 mix-blend-screen"
              />
            </div>
          )}
        </div>

        {/* Schwab Dot */}
        <div
          className="relative group pointer-events-auto"
          onClick={(e) => {
            e.stopPropagation();
            setAuthOpen(!authOpen);
            console.log('Clicked Schwab dot');
          }}
        >
          <div
            className={clsx(
              'w-3 h-3 rounded-full transition-all duration-300 group-hover:scale-125',
              isConnectedToSchwab === null
                ? 'bg-gray-400 animate-pulse'
                : isConnectedToSchwab
                ? 'bg-green-500 shadow-[0_0_10px_2px_rgba(34,197,94,0.6)]'
                : 'bg-red-500 shadow-[0_0_10px_2px_rgba(239,68,68,0.6)]'
            )}
            title="Schwab Connection Status"
          />
          {authOpen && (
            <div
              ref={dropdownRef}
              className="absolute left-8 top-0 z-[9999] w-72 pointer-events-auto bg-base-100 text-base-content shadow-lg rounded-lg p-4"
            >
              <SchwabAuth
                token={
                  typeof window !== 'undefined'
                    ? localStorage.getItem('token') ?? ''
                    : ''
                }
              />
            </div>
          )}
        </div>
      </div>

      {/* Navigation */}
      <nav className="px-2 mt-4 space-y-6 text-sm text-neutral-300">
        {navSections.map(({ title, links }) => (
          <div key={title}>
            {expanded && (
              <div className="px-2 mb-2 text-xs font-bold uppercase text-neutral-500">
                {title}
              </div>
            )}
            <ul className="space-y-1">
              {links.map(({ href, icon, label }) => {
                const isActive = pathname === href;
                return (
                  <li key={href}>
                    <Link
                      href={href}
                      className={clsx(
                        'flex items-center px-3 py-2 rounded-md transition-all duration-200 group',
                        isActive
                          ? 'bg-indigo-500/30 text-white font-semibold'
                          : 'hover:bg-white/10',
                        expanded ? 'gap-3 justify-start' : 'justify-center'
                      )}
                      onClick={handleLinkClick}
                    >
                      <span className="text-lg transition-transform duration-200 group-hover:scale-110">
                        {icon}
                      </span>
                      {expanded && (
                        <span className="text-sm transition-opacity duration-200 opacity-100">
                          {label}
                        </span>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>
    </aside>
  );
}
