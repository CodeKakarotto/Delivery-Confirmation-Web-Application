import { NavLink, Outlet } from 'react-router';
import { addDays, localDateKey, weekStartKey } from '../../../shared/shopTime.ts';
import { fullDayLabel, weekLabel } from '../lib/calendar.ts';
import { useShopTimeZone } from '../lib/useShopConfig.ts';

const TABS = [
  { to: '/shop', label: 'Overview', end: true },
  { to: '/shop/confirmations', label: 'Confirmations', end: false },
];

/**
 * The shop employees' section: where "today" and "this week" are, and the Overview / Confirmations tabs.
 * It is kept apart from the driver screens, but it is NOT protected by a sign-in (the prototype has none).
 */
export function ShopLayout() {
  const timeZone = useShopTimeZone();
  const today = localDateKey(new Date(), timeZone);
  const weekStart = weekStartKey(today);
  return (
    <div className="shop">
      <div className="shop-head">
        <div className="shop-head-text">
          <p className="shop-kicker">Shop employees</p>
          <p className="shop-now">
            <span>
              <strong>Today:</strong> {fullDayLabel(today)}
            </span>
            <span>
              <strong>This week:</strong> {weekLabel(weekStart, addDays(weekStart, 6))}
            </span>
          </p>
        </div>
        <nav className="shop-tabs" aria-label="Shop sections (view only)">
          {TABS.map((t) => (
            <NavLink key={t.to} to={t.to} end={t.end} className={({ isActive }) => (isActive ? 'is-active' : '')}>
              {t.label}
            </NavLink>
          ))}
        </nav>
      </div>
      <p className="shop-warning no-print" role="note">
        For shop employees. This prototype has no sign-in, so it cannot check who is viewing: it only runs in the local demonstration
        with synthetic data.
      </p>
      <Outlet />
    </div>
  );
}
