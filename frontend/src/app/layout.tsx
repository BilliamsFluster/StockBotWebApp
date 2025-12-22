import type { Metadata } from "next";
import { Inter, Space_Grotesk } from "next/font/google";
import "./globals.css";
import LayoutWrapper from "@/components/layout/LayoutWrapper";
import DebugBridge from "@/components/DebugBridge";

const inter = Inter({ subsets: ["latin"] });
const spaceGrotesk = Space_Grotesk({ subsets: ["latin"], variable: "--font-display" });

export const metadata: Metadata = {
  title: "BWA Studio",
  description: "Motion-forward product experiences for trading and AI teams.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark" data-accent="violet">
      <body className={`${inter.className} ${spaceGrotesk.variable}`}>
        <div className="blob blob-accent"></div>
        <div className="blob blob-blue"></div>

        <div className="relative z-10 flex min-h-screen flex-col">
          <DebugBridge />
          <LayoutWrapper>{children}</LayoutWrapper>
        </div>
      </body>
    </html>
  );
}
