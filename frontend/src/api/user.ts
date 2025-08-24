import { useQuery } from '@tanstack/react-query';
import api from '@/api/client';

export interface UserProfile {
  username: string;
  email?: string;
  createdAt?: string;
  updatedAt?: string;
  preferences?: Record<string, any>;
}

async function fetchProfile(): Promise<UserProfile> {
  const { data } = await api.get('/users/profile');
  return data;
}

export function useProfile() {
  return useQuery({
    queryKey: ['profile'],
    queryFn: fetchProfile,
  });
}
