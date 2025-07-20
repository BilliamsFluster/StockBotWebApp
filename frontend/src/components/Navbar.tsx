'use client';

import Link from 'next/link';

export default function Navbar() {
  return (
    <div className="navbar bg-neutral text-neutral-content">
      <div className="flex-1 px-4 text-xl font-bold">Jarvis AI</div>
      <div className="flex-none gap-4">
        <Link href="/" className="btn btn-ghost">
          Home
        </Link>
        <Link href="/auth" className="btn btn-ghost">
          Auth
        </Link>
      </div>
    </div>
  );
}
