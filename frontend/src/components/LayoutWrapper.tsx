'use client';

import { useState } from 'react';
import Sidebar from '@/components/Sidebar';
import { FaBars } from 'react-icons/fa';

export default function LayoutWrapper({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar */}
      <Sidebar isMobileOpen={sidebarOpen} setMobileOpen={setSidebarOpen} />

      {/* Mobile topbar hamburger */}
      <div className="lg:hidden fixed top-2 left-2 z-50">
        <button
          onClick={() => setSidebarOpen(prev => !prev)}

          className="btn btn-sm btn-circle bg-base-200 text-white"
        >
          <FaBars />
        </button>
      </div>

      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Main content */}
      <main className="flex-1 overflow-y-auto bg-base-100 z-0 relative">
        {children}
      </main>
    </div>
  );
}
