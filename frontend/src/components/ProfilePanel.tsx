'use client';

import { useRouter } from 'next/navigation';
import { FC } from 'react';
import { useAuth } from '@/context/AuthContext';

interface ProfilePanelProps {
  isOpen: boolean;
  onClose: () => void;
  darkMode: boolean;
  setDarkMode: (value: boolean) => void;
}

const ProfilePanel: FC<ProfilePanelProps> = ({ isOpen, onClose, darkMode, setDarkMode }) => {
  const router = useRouter();
  const { setUser } = useAuth();

  const handleLogout = () => {
    localStorage.removeItem('token');
    setUser(null); // ✅ clear auth context immediately
    onClose();
    router.push('/');
};

  return (
    <div
      className={`fixed top-0 right-0 h-full w-64 bg-base-200 shadow-lg z-50 transform transition-transform duration-300 ease-in-out ${
        isOpen ? 'translate-x-0' : 'translate-x-full'
      }`}
    >
      <div className="p-4">
        <h3 className="text-lg font-bold mb-4">User Menu</h3>
        <div className="form-control mb-2">
          <label className="cursor-pointer label justify-between">
            <span>Dark Mode</span>
            <input
              type="checkbox"
              className="toggle toggle-sm"
              checked={darkMode}
              onChange={() => setDarkMode(!darkMode)}
            />
          </label>
        </div>
        <button
          className="btn btn-sm btn-outline btn-error mt-4 w-full"
          onClick={handleLogout}
        >
          Log Out
        </button>
      </div>
    </div>
  );
};

export default ProfilePanel;
