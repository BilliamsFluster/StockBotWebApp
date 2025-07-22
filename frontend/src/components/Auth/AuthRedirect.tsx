'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';

export default function AuthRedirect() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (loading) return;

    const isLoggedIn = !!user;

    if (!isLoggedIn && pathname !== '/') {
      router.replace('/');
    }

    if (isLoggedIn && pathname === '/') {
      router.replace('/home'); // or dashboard route
    }
  }, [user, loading, pathname, router]);

  return null;
}
