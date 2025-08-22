import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import LayoutWrapper from "@/components/LayoutWrapper";
import DebugBridge from "@/components/DebugBridge";


const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Jarvis StockBot",
  description: "AI-Powered Trading Assistant",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className={inter.className}>
        {/* These divs render the blobs. */}
        <div className="blob blob-accent"></div>
        <div className="blob blob-blue"></div>

        {/* This wrapper ensures your content appears ON TOP of the blobs. */}
        {/* ADDED min-h-screen to prevent the background cutoff on short pages. */}
        <div className="relative z-10 flex min-h-screen flex-col">
          <DebugBridge />
          <LayoutWrapper>{children}</LayoutWrapper>
        </div>
      </body>
    </html>
  );
}
