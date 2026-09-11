import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { apiUrl } from '../lib/apiBase.js';

interface User {
  id: string;
  email: string;
  name: string;
  phone?: string;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (data: { email: string; password: string; name: string; phone?: string }) => Promise<void>;
  loginWithToken: (token: string) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('token'));
  const [isLoading, setIsLoading] = useState(!!localStorage.getItem('token'));

  const logout = useCallback(() => {
    setUser(null);
    setToken(null);
    localStorage.removeItem('token');
  }, []);

  useEffect(() => {
    if (!token) {
      setIsLoading(false);
      return;
    }

    fetch(apiUrl('/api/auth/me'), {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => {
        if (!res.ok) throw new Error('Invalid token');
        return res.json();
      })
      .then((data) => {
        const payload = data.data;
        setUser(payload?.customer ?? payload?.user ?? null);
      })
      .catch(() => logout())
      .finally(() => setIsLoading(false));
  }, [token, logout]);

  async function login(email: string, password: string) {
    const res = await fetch(apiUrl('/api/auth/customer/login'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Login failed');
    localStorage.setItem('token', data.data.token);
    setToken(data.data.token);
    setUser(data.data.customer);
  }

  function loginWithToken(newToken: string) {
    localStorage.setItem('token', newToken);
    setToken(newToken);
  }

  async function register(input: { email: string; password: string; name: string; phone?: string }) {
    const res = await fetch(apiUrl('/api/auth/customer/register'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Registration failed');
    localStorage.setItem('token', data.data.token);
    setToken(data.data.token);
    setUser(data.data.customer);
  }

  return (
    <AuthContext.Provider value={{ user, token, isLoading, login, register, loginWithToken, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
