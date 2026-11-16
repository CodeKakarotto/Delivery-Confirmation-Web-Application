import { useEffect, useId, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router';
import { ROLE_LABEL, useAuth } from '../lib/auth.tsx';
import { useOffline } from '../lib/offline.tsx';
import { SHOP_PHONE, SHOP_PHONE_TEL } from '../lib/shop.ts';
import { applyTheme, currentTheme, type Theme } from '../lib/theme.ts';
import { PhoneIcon } from './CallShop.tsx';

/**
 * Header brand: the sponsor's original logo artwork (frontend/public/brand), same as the route-optimization app.
 * Only the height is set in CSS, so the proportions are always kept.
 */
export function Brand({ subtitle = 'Delivery confirmation' }: { subtitle?: string }) {
  return (
    <span className="brand">
      <img className="brand-flower" src="/brand/michaels-flowers-flower.png" width={440} height={418} alt="" />
      <span className="brand-text">
        <img className="brand-lettering brand-lettering-light" src="/brand/michaels-flowers-lettering.png" width={1617} height={240} alt="Michael’s Flowers" />
        <img className="brand-lettering brand-lettering-dark" src="/brand/michaels-flowers-lettering-dark.png" width={1617} height={240} alt="Michael’s Flowers" />
        <span className="brand-sub">{subtitle}</span>
      </span>
    </span>
  );
}

/** Sun (light) and moon (dark) buttons; the choice is saved in localStorage (no delivery data is ever stored there). */
function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(currentTheme);
  const choose = (next: Theme) => {
    applyTheme(next);
    setTheme(next);
  };
  return (
    <div className="theme-toggle" role="group" aria-label="Color theme">
      <button type="button" className={theme === 'light' ? 'is-active' : undefined} aria-pressed={theme === 'light'} aria-label="Light mode" title="Light mode" onClick={() => choose('light')}>
        <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true">
          <circle cx="10" cy="10" r="3.6" fill="currentColor" />
          <g stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
            <path d="M10 1.8v2.1M10 16.1v2.1M1.8 10h2.1M16.1 10h2.1M4.2 4.2l1.5 1.5M14.3 14.3l1.5 1.5M4.2 15.8l1.5-1.5M14.3 5.7l1.5-1.5" />
          </g>
        </svg>
      </button>
      <button type="button" className={theme === 'dark' ? 'is-active' : undefined} aria-pressed={theme === 'dark'} aria-label="Dark mode" title="Dark mode" onClick={() => choose('dark')}>
        <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true">
          <path d="M15.6 12.6A6.5 6.5 0 0 1 7.4 4.4a6.5 6.5 0 1 0 8.2 8.2Z" fill="currentColor" />
        </svg>
      </button>
    </div>
  );
}

type NavIcon = 'report' | 'search';
type NavItem = { to: string; label: string; end: boolean; icon?: NavIcon; title?: string };
/** Sections of the menu, shown with a thin divider between them. Search always sits at the end. */
type NavSection = { kind: 'main' | 'report' | 'search'; items: NavItem[] };

const NAV: Record<'driver' | 'employee', NavSection[]> = {
  driver: [
    {
      kind: 'main',
      items: [
        { to: '/driver', label: 'Dashboard', end: true },
        { to: '/driver/confirmations', label: 'Confirmations', end: false },
      ],
    },
  ],
  employee: [
    {
      kind: 'main',
      items: [
        { to: '/shop', label: 'Dashboard', end: true },
        { to: '/shop/deliveries', label: 'Deliveries', end: false },
      ],
    },
    { kind: 'report', items: [{ to: '/shop/report', label: 'End of day', end: false, icon: 'report', title: 'End-of-day report: print or download the day’s results' }] },
    { kind: 'search', items: [{ to: '/shop/search', label: 'Search', end: false, icon: 'search', title: 'Search: find an order by its ID' }] },
  ],
};

function NavGlyph({ icon }: { icon: NavIcon }) {
  const common = { viewBox: '0 0 20 20', width: 16, height: 16, 'aria-hidden': true, fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round', strokeLinejoin: 'round' } as const;
  if (icon === 'search')
    return (
      <svg {...common}>
        <circle cx="8.5" cy="8.5" r="5" />
        <path d="m12.3 12.3 4.2 4.2" />
      </svg>
    );
  return (
    <svg {...common}>
      <rect x="4" y="3.5" width="12" height="14" rx="1.5" />
      <path d="M7.5 3.5V2.5h5v1M7 13.5v-2M10 13.5V9M13 13.5v-3.5" />
    </svg>
  );
}

/**
 * One account button in the header (initials, name, role). It opens a small menu with the light/dark switch,
 * "Call the shop" for drivers, and Sign out (which ends the session on the server).
 */
function AccountMenu() {
  const { user, logout } = useAuth();
  const { items } = useOffline();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const { pathname } = useLocation();

  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setOpen(false);
      ref.current?.querySelector<HTMLButtonElement>('.account-trigger')?.focus();
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (!user) return null;
  const unsent = items.length;
  const initials = user.displayName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('');

  const signOut = () => {
    // Signing out wipes this phone, including confirmations that have not been sent yet.
    if (
      unsent > 0 &&
      !window.confirm(
        `${unsent === 1 ? '1 confirmation has' : `${unsent} confirmations have`} not been sent yet and will be lost if you sign out now. Get signal first and wait until it says "All sent". Sign out anyway?`,
      )
    ) {
      return;
    }
    void logout();
  };

  return (
    <div className="account-menu" ref={ref}>
      <button type="button" className="account-trigger" aria-expanded={open} aria-controls={menuId} onClick={() => setOpen((o) => !o)}>
        <span className="account-avatar" aria-hidden="true">
          {initials}
        </span>
        <span className="account-name">
          {user.displayName}
          <span className="account-role">{ROLE_LABEL[user.role]}</span>
        </span>
        <svg className="account-chevron" viewBox="0 0 20 20" width="16" height="16" aria-hidden="true">
          <path d="m5.5 7.5 4.5 4.5 4.5-4.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      <div id={menuId} className="account-dropdown" hidden={!open}>
        <div className="account-dropdown-head">
          <span className="account-avatar account-avatar-large" aria-hidden="true">
            {initials}
          </span>
          <span>
            <strong>{user.displayName}</strong>
            <span className="account-role">{ROLE_LABEL[user.role]}</span>
          </span>
        </div>
        {user.role === 'driver' && (
          <a className="account-dropdown-item account-call" href={`tel:${SHOP_PHONE_TEL}`}>
            <PhoneIcon size={16} />
            <span>
              Call the shop
              <span className="account-call-number">{SHOP_PHONE}</span>
            </span>
          </a>
        )}
        <div className="account-dropdown-row">
          <span>Appearance</span>
          <ThemeToggle />
        </div>
        <button type="button" className="account-dropdown-item account-signout" onClick={signOut}>
          <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true">
            <path d="M8 3.5H4.5v13H8M12.5 6.5 16 10l-3.5 3.5M16 10H8" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Sign out
        </button>
      </div>
    </div>
  );
}

export function AppLayout() {
  const { user } = useAuth();
  const nav = user ? NAV[user.role] : [];
  return (
    <div className="app">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <div className="demo-ribbon no-print" role="note">
        Local demonstration with synthetic data only.
      </div>
      <header className="topbar no-print">
        <div className="topbar-inner">
          <NavLink to="/" className="brand-link" aria-label="Michael’s Flowers delivery confirmation, home">
            <Brand />
          </NavLink>
          <nav className="mainnav" aria-label="Main">
            {nav.map((section) => (
              <div key={section.kind} className={`nav-section nav-${section.kind}`}>
                {section.items.map((item) => (
                  <NavLink key={item.to} to={item.to} end={item.end} title={item.title} className={({ isActive }) => (isActive ? 'is-active' : '')}>
                    {item.icon && <NavGlyph icon={item.icon} />}
                    <span className="nav-label">{item.label}</span>
                  </NavLink>
                ))}
              </div>
            ))}
          </nav>
          <div className="account">
            <AccountMenu />
          </div>
        </div>
      </header>
      <main id="main" className="page" tabIndex={-1}>
        <Outlet />
      </main>
    </div>
  );
}
