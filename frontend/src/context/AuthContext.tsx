'use client';

import {
  createContext,
  useContext,
  useEffect,
  useState,
  ReactNode,
} from 'react';
import { checkAuth } from '../api/client';

interface User {
  id: string;
  username: string;
  email: string;
}

interface AuthContextType {
  user: User | null;
  setUser: (user: User | null) => void;
  loading: boolean;
  authChecked: boolean; // ✅ new flag so AuthRedirect knows when check is done
  refreshSession: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider = ({ children }: AuthProviderProps) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [authChecked, setAuthChecked] = useState(false); // ✅

  // Track last refresh time
  const [lastRefresh, setLastRefresh] = useState<number>(0);

  const ACCESS_TOKEN_LIFETIME = 20 * 60 * 1000; // 20 minutes
  const REFRESH_THRESHOLD = 5 * 60 * 1000; // refresh 5 min before expiry

  const refreshSession = async (): Promise<void> => {
    try {
      const res = await checkAuth();
      setUser(res.data.user || null);
      setLastRefresh(Date.now());
    } catch {
      setUser(null);
    } finally {
      setAuthChecked(true); // ✅ Always set to true after check finishes
    }
  };

  useEffect(() => {
    const init = async () => {
      await refreshSession();
      setLoading(false);
    };
    init();
  }, []);

  // Auto refresh if close to expiry
  useEffect(() => {
    const checkRefresh = () => {
      const timeSinceLast = Date.now() - lastRefresh;
      const timeUntilExpiry = ACCESS_TOKEN_LIFETIME - timeSinceLast;

      if (timeUntilExpiry <= REFRESH_THRESHOLD) {
        refreshSession();
      }
    };

    const interval = setInterval(checkRefresh, 60 * 1000);
    return () => clearInterval(interval);
  }, [lastRefresh]);

  return (
    <AuthContext.Provider
      value={{ user, setUser, loading, authChecked, refreshSession }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
