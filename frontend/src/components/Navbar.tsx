'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import clsx from 'clsx';

export default function Navbar() {
  const pathname = usePathname();

  const linkClass = (href: string) =>
    clsx('btn btn-ghost', {
      'btn-active': pathname === href,
    });

  return (
    <div className="navbar bg-neutral text-neutral-content">
      <div className="flex-1 px-4 text-xl font-bold">Jarvis AI</div>
      <div className="flex-none gap-2">
        <Link href="/" className={linkClass('/')}>
          Home
        </Link>
        <Link href="/chatbot" className={linkClass('/chatbot')}>
          Chatbot
        </Link>
        <Link href="/portfolio" className={linkClass('/portfolio')}>
          Portfolio
        </Link>
        <Link href="/auth" className={linkClass('/auth')}>
          Auth
        </Link>
      </div>
    </div>
  );
}
