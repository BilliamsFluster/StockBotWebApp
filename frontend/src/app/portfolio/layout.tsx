import LayoutWrapper from '@/components/LayoutWrapper';

export const metadata = {
  title: 'Jarvis | portfolio',
  description: 'Your AI-powered market strategist',
};

export default function PortfolioLayout({ children }: { children: React.ReactNode }) {
  return <LayoutWrapper>{children}</LayoutWrapper>;
}
