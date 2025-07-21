// src/app/layout.tsx
'use client';

import './globals.css';
import type { ReactNode } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useEffect } from 'react';
import Providers from '@/components/Providers';
import { Toaster } from 'react-hot-toast';

export default function RootLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    const token = localStorage.getItem('token');

    // 1) If NOT logged in and NOT already on / → redirect to /
    if (!token && pathname !== '/') {
      router.replace('/');
      return;
    }

    // 2) If logged in and on / → redirect to home (or dashboard)
    if (token && pathname === '/') {
      router.replace('/');
    }
  }, [pathname, router]);

  return (
    <html lang="en">
      <body>
        <Providers>
          {children}
          <Toaster
            position="top-center"
            toastOptions={{ duration: 3000 }}
          />
        </Providers>
      </body>
    </html>
  );
}
