// hooks/useWarmPortfolioData.ts
'use client';

import { useEffect } from 'react';
import { usePortfolioData } from '@/hooks/usePortfolioData';
import { useAuth } from '@/context/AuthContext';

export function useWarmPortfolioData() {
  const { user, authChecked } = useAuth();

  // Always call hook, but don't auto-fetch
  const { refetch } = usePortfolioData(); // This runs immediately in your case

  useEffect(() => {
    // Only trigger warmup after login
    if (authChecked && user) {
      refetch();
    }
  }, [authChecked, user, refetch]);
}
