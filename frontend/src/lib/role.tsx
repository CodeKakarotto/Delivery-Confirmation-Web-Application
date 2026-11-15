import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { setApiRole } from '../api/client.ts';

/**
 * PROTOTYPE STAND-IN FOR LOGINS. The person picks "driver" or "shop employee" on the home screen; the choice is kept
 * in this browser (localStorage; it is not customer data) and sent with every API call, where the server accepts each
 * endpoint only for its own role. It separates the two parts of the app but proves nothing about who someone is.
 * With real logins, the role comes from the signed-in account instead and this file goes away.
 */
export type Role = 'driver' | 'shop';

const KEY = 'mf-demo-role';

function readStored(): Role | null {
  try {
    const v = window.localStorage.getItem(KEY);
    return v === 'driver' || v === 'shop' ? v : null;
  } catch {
    return null;
  }
}

export const RoleContext = createContext<{ role: Role | null; setRole: (r: Role | null) => void }>({ role: null, setRole: () => {} });

export function RoleProvider({ children }: { children: ReactNode }) {
  const [role, setRoleState] = useState<Role | null>(() => {
    const r = typeof window === 'undefined' ? null : readStored();
    setApiRole(r);
    return r;
  });
  const setRole = useCallback((r: Role | null) => {
    try {
      if (r) window.localStorage.setItem(KEY, r);
      else window.localStorage.removeItem(KEY);
    } catch {
      // Storage unavailable: the choice lasts until the page is reloaded.
    }
    setApiRole(r);
    setRoleState(r);
  }, []);
  return <RoleContext.Provider value={{ role, setRole }}>{children}</RoleContext.Provider>;
}

export function useRole() {
  return useContext(RoleContext);
}

export const ROLE_HOME: Record<Role, string> = { driver: '/confirm', shop: '/shop' };
export const ROLE_LABEL: Record<Role, string> = { driver: 'Driver', shop: 'Shop employee' };
