// src/components/Portfolio/usePortfolioData.ts
import { useQuery } from '@tanstack/react-query';
import { getActiveApiPortfolioData } from '@/api/brokerService';

export function usePortfolioData() {
  return useQuery({
    queryKey: ['portfolio'],
    queryFn: getActiveApiPortfolioData, 
  });
  
}