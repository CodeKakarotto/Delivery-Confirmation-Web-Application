import type { ReactNode } from 'react';
import { Link, Navigate, useLocation } from 'react-router';
import type { UserRole } from '../../../shared/types.ts';
import { ROLE_HOME, useAuth } from '../lib/auth.tsx';
import { Notice, Spinner } from './ui.tsx';

/**
 * Shows a page only to a signed-in account with this role; otherwise sends the person to sign in. (The server checks
 * the same on every request; this is so the screens match.)
 */
export function RequireAuth({ role, children }: { role: UserRole; children: ReactNode }) {
  const { status, user } = useAuth();
  const location = useLocation();
  if (status === 'loading') return <Spinner label="Checking your sign-in" />;
  if (status === 'signed-out' || !user) return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  if (user.role === role) return <>{children}</>;
  return (
    <div className="narrow">
      <Notice
        tone="warn"
        title={`This page is ${role === 'driver' ? 'for drivers' : 'for shop employees'}`}
        action={
          <Link to={ROLE_HOME[user.role]} className="btn btn-small">
            Go to my dashboard
          </Link>
        }
      >
        You are signed in as {user.displayName}.
      </Notice>
    </div>
  );
}
