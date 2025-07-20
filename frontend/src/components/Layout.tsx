import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Your App Title',
  description: 'Your app description',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" data-theme="light">
      <body className="min-h-screen bg-base-200">
        {/* Your Navbar goes here */}
        {children}
        {/* Your Footer goes here */}
      </body>
    </html>
  );
}
