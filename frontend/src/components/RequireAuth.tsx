import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router';
import type { UserRole } from '../../../shared/types.ts';
import { ROLE_HOME, useAuth } from '../lib/auth.tsx';
import { Spinner } from './ui.tsx';

/**
 * Shows a page only to a signed-in account with this role. Signed out: to the sign-in page. Signed in with the other
 * role: straight to that account's own dashboard. (The server checks the same on every request.)
 */
export function RequireAuth({ role, children }: { role: UserRole; children: ReactNode }) {
  const { status, user } = useAuth();
  const location = useLocation();
  if (status === 'loading') return <Spinner label="Checking your sign-in" />;
  if (status === 'signed-out' || !user) return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  if (user.role !== role) return <Navigate to={ROLE_HOME[user.role]} replace />;
  return <>{children}</>;
}
