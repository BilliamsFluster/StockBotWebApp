// app/layout.tsx
'use client';

import './globals.css';
import type { ReactNode } from 'react';
import { useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';

import Providers from '@/components/Providers';
import { Toaster } from 'react-hot-toast';
import AuthRedirect from '@/components/Auth/AuthRedirect';

// Jarvis imports
import { JarvisProvider } from '@/components/Jarvis/JarvisProvider';
import JarvisWidget from '@/components/Jarvis/JarvisWidget';

export default function RootLayout({ children }: { children: ReactNode }) {
  const [isClient, setIsClient] = useState(false);
  const pathname = usePathname();

  // Define auth routes where Jarvis should be hidden
  const isAuthPage =
    pathname === '/' ||
    pathname === '/login' ||
    pathname === '/register';

  useEffect(() => {
    setIsClient(true);
  }, []);

  return (
    <html lang="en">
      <body>
        {isClient && (
          <Providers>
            <JarvisProvider>
              <AuthRedirect />
              {children}

              {/* Only show Jarvis widget if NOT on auth page */}
              {!isAuthPage && <JarvisWidget />}

              <Toaster
                position="top-center"
                toastOptions={{ duration: 3000 }}
              />
            </JarvisProvider>
          </Providers>
        )}
      </body>
    </html>
  );
}
