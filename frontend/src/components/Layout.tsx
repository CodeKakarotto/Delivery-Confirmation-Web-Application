import { useState } from 'react';
import { NavLink, Outlet } from 'react-router';
import { applyTheme, currentTheme, type Theme } from '../lib/theme.ts';

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

const NAV = [
  { to: '/confirm', label: 'Confirm a delivery' },
  { to: '/dashboard', label: 'Confirmations' },
];

export function AppLayout() {
  return (
    <div className="app">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <div className="demo-ribbon no-print" role="note">
        Local demonstration with synthetic data. There is no sign-in, so this app must not hold real customer information.
      </div>
      <header className="topbar no-print">
        <div className="topbar-inner">
          <NavLink to="/" className="brand-link" aria-label="Michael’s Flowers delivery confirmation, home">
            <Brand />
          </NavLink>
          <nav className="mainnav" aria-label="Main">
            {NAV.map((item) => (
              <NavLink key={item.to} to={item.to} className={({ isActive }) => (isActive ? 'is-active' : '')}>
                {item.label}
              </NavLink>
            ))}
          </nav>
          <div className="account">
            <ThemeToggle />
          </div>
        </div>
      </header>
      <main id="main" className="page" tabIndex={-1}>
        <Outlet />
      </main>
    </div>
  );
}
