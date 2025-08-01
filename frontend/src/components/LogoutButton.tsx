'use client';

import { useRouter } from 'next/navigation';
import { logout } from '@/api/client';
import { useAuth } from '@/context/AuthContext';

export default function LogoutButton() {
  const router = useRouter();
  const { setUser } = useAuth();

  const handleLogout = async () => {
    try {
      await logout(); // ✅ backend clears cookie
      setUser(null); // ✅ clear context
      router.push('/'); // ✅ back to login
    } catch (err) {
      console.error('Logout failed', err);
    }
  };

  return (
    <button onClick={handleLogout} className="btn btn-error">
      Logout
    </button>
  );
}
