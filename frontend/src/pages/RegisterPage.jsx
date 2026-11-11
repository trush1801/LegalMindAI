import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { ArrowLeft, Eye, EyeOff, Shield } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import ThemeToggle from '../components/ThemeToggle';

export default function RegisterPage() {
  const { register, isAuthenticated, loading } = useAuth();
  const navigate = useNavigate();

  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
    confirm: '',
  });
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (!loading && isAuthenticated) {
    return <Navigate to="/dashboard" replace />;
  }

  const set = (key) => (e) => setForm((prev) => ({ ...prev, [key]: e.target.value }));

  const onSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (form.password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }
    if (form.password !== form.confirm) {
      setError('Passwords do not match');
      return;
    }

    setSubmitting(true);
    try {
      await register({
        name: form.name.trim(),
        email: form.email.trim(),
        password: form.password,
      });
      navigate('/dashboard', { replace: true });
    } catch (err) {
      let message = 'Registration failed. Please try again.';
      if (typeof err === 'string') {
        message = err;
      } else if (typeof err?.message === 'string') {
        message = err.message;
      } else if (typeof err?.error === 'string') {
        message = err.error;
      } else if (typeof err?.error?.message === 'string') {
        message = err.error.message;
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

          <h1>Build your legal analysis workspace.</h1>
          <p>
            Create an account to upload contracts, run multi-stage AI analysis, and
            generate citation-backed reports.
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
          <h2>Create account</h2>
          <p className="auth-sub">Start with a professional legal analyst workspace.</p>

          {error ? (
            <div
              className="alert alert-error"
              role="alert"
              aria-live="assertive"
              style={{ marginBottom: '1rem' }}
            >
              {typeof error === 'string' ? error : (error?.message || 'Registration failed. Please try again.')}
            </div>
          ) : null}

          <form onSubmit={onSubmit}>
            <div className="form-group">
              <label className="form-label" htmlFor="name">Full Name</label>
              <input
                id="name"
                className="form-input"
                value={form.name}
                onChange={set('name')}
                required
                placeholder="Ada Vance"
              />
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="email">Work Email</label>
              <input
                id="email"
                className="form-input"
                type="email"
                value={form.email}
                onChange={set('email')}
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
                  value={form.password}
                  onChange={set('password')}
                  required
                  placeholder="Min. 6 characters"
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

            <div className="form-group">
              <label className="form-label" htmlFor="confirm">Confirm Password</label>
              <input
                id="confirm"
                className="form-input"
                type={showPassword ? 'text' : 'password'}
                value={form.confirm}
                onChange={set('confirm')}
                required
                placeholder="Re-enter password"
              />
            </div>

            <button className="btn btn-primary btn-block btn-lg" type="submit" disabled={submitting} style={{ marginTop: '1.25rem' }}>
              {submitting ? 'Creating workspace…' : 'Create Account'}
            </button>
          </form>

          <div className="auth-footer">
            <div>Already have an account? <Link to="/login">Sign in</Link></div>
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