import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router';
import { ApiRequestError, errorMessage } from '../api/client.ts';
import { Brand } from '../components/Layout.tsx';
import { Notice, Spinner } from '../components/ui.tsx';
import { ROLE_HOME, useAuth } from '../lib/auth.tsx';

/** Simple sign-in: username and password. Drivers and shop employees land on their own dashboard. */
export function LoginPage() {
  const { status, user, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from;
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ids = { user: useId(), pass: useId(), err: useId() };
  const userRef = useRef<HTMLInputElement>(null);
  useEffect(() => userRef.current?.focus(), []);

  if (status === 'loading') return <Spinner label="Checking your sign-in" />;
  if (status === 'signed-in' && user) return <Navigate to={from && from !== '/login' ? from : ROLE_HOME[user.role]} replace />;

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    if (!username.trim() || !password) {
      setError('Enter your username and password.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await login(username.trim(), password);
      navigate(from && from !== '/login' ? from : '/', { replace: true });
    } catch (err) {
      setPassword(''); // never keep a rejected password on screen
      setError(err instanceof ApiRequestError && err.status === 0 ? errorMessage(err) : err instanceof ApiRequestError ? err.message : 'Could not sign in. Try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-brand">
        <Brand subtitle="Delivery confirmation" />
      </div>
      <form className="card login-card" onSubmit={onSubmit} noValidate aria-describedby={error ? ids.err : undefined}>
        <h1>Sign in</h1>
        {error && (
          <div id={ids.err}>
            <Notice tone="error">{error}</Notice>
          </div>
        )}
        <div className="field">
          <label htmlFor={ids.user}>Username</label>
          <input
            ref={userRef}
            id={ids.user}
            className="input-large"
            name="username"
            autoComplete="username"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            maxLength={64}
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor={ids.pass}>Password</label>
          <div className="password-row">
            <input
              id={ids.pass}
              className="input-large"
              name="password"
              type={show ? 'text' : 'password'}
              autoComplete="current-password"
              maxLength={256}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <button type="button" className="btn" onClick={() => setShow((s) => !s)} aria-pressed={show} aria-controls={ids.pass}>
              {show ? 'Hide' : 'Show'}
            </button>
          </div>
        </div>
        <button type="submit" className="btn btn-primary btn-block btn-large" disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
        <p className="muted small login-help">Forgot your password? Ask the shop manager to reset your account.</p>
      </form>
    </div>
  );
}
