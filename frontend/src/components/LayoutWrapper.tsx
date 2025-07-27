import type { ReactNode } from 'react';
import Navbar from '@/components/Navbar';

export default function LayoutWrapper({ children }: { children: ReactNode }) {
  return (
    <>
      <Navbar />
      <main className="p-4 bg-base-200 min-h-screen">{children}</main>
    </>
  );
}
