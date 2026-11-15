import { Link, useNavigate } from 'react-router';
import { Notice } from '../components/ui.tsx';
import { ROLE_HOME, ROLE_LABEL, useRole, type Role } from '../lib/role.tsx';
import { useShopConfig } from '../lib/useShopConfig.ts';

/**
 * "Who are you?": the prototype's stand-in for a login screen. Drivers get Confirm a Delivery; shop employees get the
 * view-only Overview and Confirmations. The final system replaces this with real sign-in.
 */
export function HomePage() {
  const config = useShopConfig();
  const { role, setRole } = useRole();
  const navigate = useNavigate();
  const choose = (r: Role) => {
    setRole(r);
    navigate(ROLE_HOME[r]);
  };
  return (
    <>
      <div className="page-head">
        <h1>Who is using the app?</h1>
      </div>
      {config && !config.dataAvailable && (
        <Notice tone="error" title="Delivery data is not available here">
          This prototype only serves delivery data in the local demonstration (APP_ENV=development on localhost). See docs/SECURITY.md.
        </Notice>
      )}
      {role && (
        <Notice tone="info" action={<Link to={ROLE_HOME[role]} className="btn btn-small btn-primary">Continue</Link>}>
          You are using the app as: <strong>{ROLE_LABEL[role]}</strong>.
        </Notice>
      )}
      <div className="home-grid">
        <button type="button" className={`card home-card${role === 'driver' ? ' is-current' : ''}`} onClick={() => choose('driver')}>
          <span className="home-card-kicker">Drivers</span>
          <span className="home-card-title">I’m a driver</span>
          <span className="muted">See today’s awaiting deliveries, record who received each one and capture the customer’s signature.</span>
        </button>
        <button type="button" className={`card home-card${role === 'shop' ? ' is-current' : ''}`} onClick={() => choose('shop')}>
          <span className="home-card-kicker">Shop employees</span>
          <span className="home-card-title">I’m a shop employee</span>
          <span className="muted">View today’s deliveries and every confirmation by month, week and day with its delivery time.</span>
        </button>
      </div>
      <p className="muted small home-note">
        Prototype: choosing a role stands in for signing in. The final system will use real logins.
      </p>
    </>
  );
}

export function NotFoundPage() {
  return (
    <Notice tone="warn" title="Page not found" action={<Link to="/" className="btn btn-small">Home</Link>}>
      This page does not exist.
    </Notice>
  );
}
