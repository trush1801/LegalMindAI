import { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft, Eye, EyeOff, Shield } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import ThemeToggle from '../components/ThemeToggle';

export default function LoginPage() {
  const { login, isAuthenticated, loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = location.state?.from?.pathname || '/dashboard';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (!loading && isAuthenticated) {
    return <Navigate to="/dashboard" replace />;
  }

  const onSubmit = async (e) => {
    e.preventDefault();
    setError('');

    const cleanEmail = email.trim();
    if (!cleanEmail) {
      setError('Please enter your work email.');
      return;
    }
    if (!password) {
      setError('Please enter your password.');
      return;
    }

    setSubmitting(true);
    try {
      await login(cleanEmail, password);
      navigate(from, { replace: true });
    } catch (err) {
      let message = 'Invalid email or password. Please try again.';
      if (typeof err === 'string') {
        message = err;
      } else if (typeof err?.message === 'string') {
        message = err.message;
      } else if (typeof err?.error === 'string') {
        message = err.error;
      } else if (typeof err?.error?.message === 'string') {
        message = err.error.message;
      } else if (err?.status === 401) {
        message = 'Invalid email or password. Please try again.';
      } else if (!err?.status || err?.message === 'Network Error') {
        message = 'Unable to connect to the server. Please try again.';
      }
      setError(message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="auth-layout">
      <section className="auth-brand">
        <div className="auth-brand-content">
          <div className="auth-brand-top">
            <Link to="/" className="auth-brand-back-btn">
              <ArrowLeft size={14} />
              <span>Back to Home</span>
            </Link>
            <ThemeToggle />
          </div>

          <Link to="/" className="auth-logo" title="Back to Home">
            <span className="auth-logo-mark">
              <Shield size={18} />
            </span>
            <span>LegalMind AI</span>
          </Link>

          <h1>Contract intelligence with grounded legal reasoning.</h1>
          <p>
            Upload agreements, surface risky clauses, track critical dates, and ask
            evidence-backed questions — then export a polished PDF report.
          </p>
        </div>

        <div className="auth-brand-content" style={{ opacity: 0.75 }}>
          <div className="flex-center gap-2 text-xs text-mono">
            <span>■</span>
            <span>SYSTEM ARCHITECTURE · SECURE TENANT ISOLATION</span>
          </div>
        </div>
      </section>

      <section className="auth-panel">
        <div className="auth-card">
          <h2>Welcome back</h2>
          <p className="auth-sub">Sign in to continue to your workspace.</p>

          {error ? (
            <div
              className="alert alert-error"
              role="alert"
              aria-live="assertive"
              style={{ marginBottom: '1rem' }}
            >
              {typeof error === 'string' ? error : (error?.message || 'Invalid email or password. Please try again.')}
            </div>
          ) : null}

          <form onSubmit={onSubmit}>
            <div className="form-group">
              <label className="form-label" htmlFor="email">Work Email</label>
              <input
                id="email"
                className="form-input"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (error) setError('');
                }}
                required
                placeholder="counsel@firm.com"
              />
            </div>

            <div className="form-group">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <label className="form-label" htmlFor="password">Password</label>
              </div>
              <div style={{ position: 'relative' }}>
                <input
                  id="password"
                  className="form-input"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (error) setError('');
                  }}
                  required
                  placeholder="••••••••"
                  style={{ paddingRight: '2.5rem' }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  style={{
                    position: 'absolute',
                    right: '10px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: 'var(--color-text-muted)',
                    display: 'grid',
                    placeItems: 'center',
                    padding: 0
                  }}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <button className="btn btn-primary btn-block btn-lg" type="submit" disabled={submitting} style={{ marginTop: '1.25rem' }}>
              {submitting ? 'Signing in…' : 'Sign in to Workspace'}
            </button>
          </form>

          <div className="auth-footer">
            <div>Don't have an account? <Link to="/register">Create one</Link></div>
            <div className="auth-footer-divider"></div>
            <Link to="/" className="auth-footer-back">
              <ArrowLeft size={13} />
              <span>Back to Home</span>
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}