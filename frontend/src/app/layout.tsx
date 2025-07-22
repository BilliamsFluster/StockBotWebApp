'use client';

import './globals.css';
import type { ReactNode } from 'react';
import { useState, useEffect } from 'react';
import Providers from '@/components/Providers';
import { Toaster } from 'react-hot-toast';
import AuthRedirect from '@/components/Auth/AuthRedirect';

export default function RootLayout({ children }: { children: ReactNode }) {
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);

  return (
    <html lang="en">
      <body>
        {isClient && (
          <Providers>
            <AuthRedirect />
            {children}
            <Toaster position="top-center" toastOptions={{ duration: 3000 }} />
          </Providers>
        )}
      </body>
    </html>
  );
}
