'use client';

import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';

export default function AuthRedirect() {
  const { user, loading, authChecked  } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!authChecked) return; 

    if (!user && pathname !== '/') {
      router.replace('/');
    }

    if (user && pathname === '/') {
      router.replace('/chatbot');
    }
  }, [user, authChecked, pathname, router]);

  return null;
}
