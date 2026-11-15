import type { ReactNode } from 'react';
import { Link, useNavigate } from 'react-router';
import { ROLE_HOME, useRole, type Role } from '../lib/role.tsx';
import { Notice } from './ui.tsx';

/** Shows a section only to its role (prototype stand-in for logins; the server checks the role too). */
export function RoleGate({ role, children }: { role: Role; children: ReactNode }) {
  const { role: current, setRole } = useRole();
  const navigate = useNavigate();
  if (current === role) return <>{children}</>;
  if (current === null) {
    return (
      <div className="narrow">
        <Notice tone="info" title="Choose who you are" action={<Link to="/" className="btn btn-small btn-primary">Choose</Link>}>
          Pick “I’m a driver” or “I’m a shop employee” on the home screen first.
        </Notice>
      </div>
    );
  }
  const forWhom = role === 'driver' ? 'for drivers' : 'for shop employees';
  return (
    <div className="narrow">
      <Notice
        tone="warn"
        title={`This page is ${forWhom}`}
        action={
          <button type="button" className="btn btn-small" onClick={() => navigate(ROLE_HOME[current])}>
            Go to my section
          </button>
        }
      >
        You are using the app as a {current === 'driver' ? 'driver' : 'shop employee'}.{' '}
        <button
          type="button"
          className="link-button"
          onClick={() => {
            setRole(null);
            navigate('/');
          }}
        >
          Switch role
        </button>
      </Notice>
    </div>
  );
}
