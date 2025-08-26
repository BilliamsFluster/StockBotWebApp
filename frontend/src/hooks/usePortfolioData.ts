// src/hooks/usePortfolioData.ts
import { useQuery } from '@tanstack/react-query';
import { getActiveApiPortfolioData } from '@/api/brokerService';

/**
 * Small wrapper around the portfolio query so pages can optionally disable the
 * fetch (e.g. when no broker is connected).  Defaults to enabled.
 */
export function usePortfolioData(enabled: boolean = true) {
  return useQuery({
    queryKey: ['portfolio'],
    queryFn: getActiveApiPortfolioData,
    enabled,
  });
}