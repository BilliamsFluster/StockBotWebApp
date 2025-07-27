// app/portfolio/page.tsx
'use client';

import dynamic from 'next/dynamic';

// Dynamically import to avoid hydration mismatches or for better performance
const PortfolioPage = dynamic(() => import('@/components/Portfolio/PortfolioPage'), {
  ssr: false,
});

export default function Portfolio() {
  return <PortfolioPage />;
}
