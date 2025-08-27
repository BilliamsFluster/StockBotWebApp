'use client';

import React, { useState, useEffect } from 'react';
import Lenis from '@studio-freight/lenis';
import { usePathname } from 'next/navigation';
import { Toaster } from 'react-hot-toast';
import { AuthProvider } from '@/context/AuthContext';
import { OnboardingProvider, useOnboarding } from '@/context/OnboardingContext';

import Providers from '@/components/Providers';
import AuthRedirect from '@/components/Auth/AuthRedirect';
import { JarvisProvider } from '@/components/Jarvis/JarvisProvider';
import JarvisWidget from '@/components/Jarvis/JarvisWidget';
import Sidebar from '@/components/Sidebar';
import { Menu } from 'lucide-react';
import clsx from 'clsx';
import { OnboardingDialog } from '@/components/overview/OnboardingDialogue';

function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { showOnboarding, setShowOnboarding } = useOnboarding();

  const [isMobileOpen, setMobileOpen] = useState(false);
  const [isSidebarExpanded, setSidebarExpanded] = useState(true);

  const isAuthPage =
    pathname === '/' ||
    pathname === '/auth' ||
    pathname === '/login' ||
    pathname === '/register';

  // ✅ Initialize Lenis globally
  useEffect(() => {
    const lenis = new Lenis({
      duration: 1.2,
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      
    });

    function raf(time: number) {
      lenis.raf(time);
      requestAnimationFrame(raf);
    }

    requestAnimationFrame(raf);

    return () => {
      lenis.destroy();
    };
  }, []);

  if (isAuthPage) {
    return (
      <>
        <AuthRedirect />
        {children}
      </>
    );
  }

  return (
    <>
      <AuthRedirect />
      <Sidebar
        isMobileOpen={isMobileOpen}
        setMobileOpen={setMobileOpen}
        isExpanded={isSidebarExpanded}
        setExpanded={setSidebarExpanded}
      />
      <main
        data-lenis-scroll
        className={clsx(
          'flex flex-col transition-all duration-300 min-h-screen',
          isSidebarExpanded ? 'lg:ml-64' : 'lg:ml-[76px]'
        )}
      >
        {/* Mobile Header */}
        <header className="lg:hidden sticky top-0 z-30 flex h-14 items-center gap-4 border-b border-border bg-background/80 backdrop-blur-lg px-4 md:px-6">
          <button
            className="p-2 -ml-2 rounded-md hover:bg-accent hover:text-accent-foreground"
            onClick={() => setMobileOpen(true)}
          >
            <Menu className="h-6 w-6" />
            <span className="sr-only">Open sidebar</span>
          </button>
        </header>
        <div className="flex-1">{children}</div>
      </main>
      <OnboardingDialog open={showOnboarding} onOpenChange={setShowOnboarding} />
      {!isAuthPage && <JarvisWidget />}
    </>
  );
}

export default function LayoutWrapper({
  children,
}: {
  children: React.ReactNode;
}) {
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);

  if (!isClient) return null;

  return (
    <Providers>
      <JarvisProvider>
        <AuthProvider>
          <OnboardingProvider>
            <AppLayout>{children}</AppLayout>
          </OnboardingProvider>
          <Toaster position="top-center" toastOptions={{ duration: 3000 }} />
        </AuthProvider>
      </JarvisProvider>
    </Providers>
  );
}
