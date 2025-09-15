'use client';

import dynamic from 'next/dynamic';
import { useProfile } from '@/api/user';

// Dynamically import the official OpenWebUI component
// @ts-expect-error - module provided at runtime
const OpenWebUIRoot = dynamic(() => import('open-webui'), { ssr: false });

export default function OpenWebUI() {
  const { data: profile } = useProfile();

  const token =
    (profile as any)?.token ||
    (profile as any)?.accessToken ||
    (profile as any)?.authToken;

  return (
    <OpenWebUIRoot
      apiUrl={`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/jarvis`}
      authToken={token}
    />
  );
}

