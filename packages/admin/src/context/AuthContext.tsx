import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { apiUrl } from '../lib/apiBase.js';
import {
  AuthScope,
  clearStoredToken,
  getStoredToken,
  scopeFromPath,
  setStoredToken,
} from '../lib/authStorage.js';

export interface UserLocation {
  id: string;
  slug: string;
  name: string;
}

export interface User {
  id: string;
  email: string;
  name: string;
  role: 'SUPER_ADMIN' | 'MANAGER' | 'STAFF';
  phone?: string | null;
  avatar?: string | null;
  locationId?: string | null;
  location?: UserLocation | null;
}

interface AuthContextValue {
  token: string;
  user: User | null;
  loading: boolean;
  scope: AuthScope;
  login: (token: string, scope?: AuthScope) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const location = useLocation();
  const scope = scopeFromPath(location.pathname);
  const [token, setToken] = useState(() => getStoredToken(scope));
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(() => !!getStoredToken(scope));

  // Switch token when moving between admin ↔ restaurant URL trees
  useEffect(() => {
    const next = getStoredToken(scope);
    setToken(next);
    if (!next) {
      setUser(null);
      setLoading(false);
    }
  }, [scope]);

  useEffect(() => {
    if (!token) {
      setUser(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    fetch(apiUrl('/api/auth/me'), {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => {
        if (!res.ok) throw new Error('Unauthorized');
        return res.json();
      })
      .then((data) => {
        if (!cancelled) {
          setUser(data.data.user);
        }
      })
      .catch(() => {
        if (!cancelled) {
          clearStoredToken(scope);
          setToken('');
          setUser(null);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [token, scope]);

  function login(newToken: string, loginScope?: AuthScope) {
    const s = loginScope ?? scope;
    setStoredToken(newToken, s);
    setToken(newToken);
  }

  function logout() {
    clearStoredToken(scope);
    setToken('');
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ token, user, loading, scope, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
