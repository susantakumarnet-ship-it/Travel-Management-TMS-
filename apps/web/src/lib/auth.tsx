'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { api, refreshSession, setAccessToken } from './api';
import type { Me, Role } from './types';
import { Spinner } from '@/components/ui/Spinner';

interface AuthState {
  user: Me | null;
  loading: boolean;
  /** Call after OTP / admin login succeeds. */
  signIn: (accessToken: string, user: Me) => void;
  signOut: () => Promise<void>;
  reload: () => Promise<void>;
  hasPermission: (perm: string) => boolean;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    refreshSession()
      .then((d) => setUser((d?.user as Me) ?? null))
      .finally(() => setLoading(false));
  }, []);

  const signIn = useCallback((token: string, u: Me) => {
    setAccessToken(token);
    setUser(u);
  }, []);

  const signOut = useCallback(async () => {
    await api('/auth/logout', { method: 'POST' }).catch(() => undefined);
    setAccessToken(null);
    setUser(null);
  }, []);

  const reload = useCallback(async () => {
    const me = await api<Me>('/auth/me');
    setUser(me);
  }, []);

  const hasPermission = useCallback(
    (perm: string) => {
      if (user?.role !== 'ADMIN') return false;
      const perms = user.adminRole?.permissions ?? [];
      if (perms.includes('*') || perms.includes(perm)) return true;
      const [mod, action] = perm.split(':');
      return action === 'read' && perms.includes(`${mod}:write`);
    },
    [user],
  );

  const value = useMemo(() => ({ user, loading, signIn, signOut, reload, hasPermission }), [user, loading, signIn, signOut, reload, hasPermission]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}

export const LOGIN_PATH: Record<Role, string> = {
  CUSTOMER: '/login',
  OWNER: '/partner/login',
  DRIVER: '/driver/login',
  ADMIN: '/admin/login',
};
export const HOME_PATH: Record<Role, string> = {
  CUSTOMER: '/account',
  OWNER: '/owner',
  DRIVER: '/driver',
  ADMIN: '/admin',
};

/** Client-side route guard. Server APIs enforce the same rules; this only controls UX. */
export function RequireRole({ role, children }: { role: Role; children: ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (loading) return;
    if (!user) router.replace(`${LOGIN_PATH[role]}?next=${encodeURIComponent(pathname)}`);
    else if (user.role !== role) router.replace(HOME_PATH[user.role]);
  }, [user, loading, role, router, pathname]);

  if (loading || !user || user.role !== role) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Spinner className="h-8 w-8 text-navy-700" />
      </div>
    );
  }
  return <>{children}</>;
}
