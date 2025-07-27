// src/components/Portfolio/usePortfolioData.ts
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import { getSchwabPortfolioData } from '@/api/jarvisApi';

export function usePortfolioData() {
  return useQuery({
    queryKey: ['portfolio'],
    queryFn: getSchwabPortfolioData,
  });
}