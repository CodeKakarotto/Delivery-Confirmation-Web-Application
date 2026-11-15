import { Link } from 'react-router';
import { configApi } from '../api/endpoints.ts';
import { Notice } from '../components/ui.tsx';
import { useApi } from '../lib/useApi.ts';

export function HomePage() {
  const config = useApi(() => configApi.get(), []);
  return (
    <>
      <div className="page-head">
        <h1>Delivery confirmation</h1>
      </div>
      {config.data && !config.data.dataAvailable && (
        <Notice tone="error" title="Delivery data is not available here">
          This prototype has no login, so it only serves delivery data in the local demonstration (APP_ENV=development on localhost).
          See docs/SECURITY.md.
        </Notice>
      )}
      <div className="home-grid">
        <Link to="/confirm" className="card home-card">
          <span className="home-card-kicker">Drivers</span>
          <span className="home-card-title">Confirm a delivery</span>
          <span className="muted">Open an order by its ID, record who received it and capture the customer’s signature.</span>
        </Link>
        <Link to="/dashboard" className="card home-card">
          <span className="home-card-kicker">Shop employees</span>
          <span className="home-card-title">Review confirmations</span>
          <span className="muted">See the day’s deliveries, find proof of delivery by order ID and review exceptions.</span>
        </Link>
      </div>
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
