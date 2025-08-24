import { useQuery } from '@tanstack/react-query';
import api from '@/api/client';

export interface UserProfile {
  username: string;
  // other fields can be added here as needed
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
