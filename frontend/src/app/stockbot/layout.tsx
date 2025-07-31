import LayoutWrapper from '@/components/LayoutWrapper';

export const metadata = {
  title: 'Jarvis | Chatbot',
  description: 'Your AI-powered market strategist',
};

export default function ChatbotLayout({ children }: { children: React.ReactNode }) {
  return<LayoutWrapper>{children}</LayoutWrapper> ;
}
