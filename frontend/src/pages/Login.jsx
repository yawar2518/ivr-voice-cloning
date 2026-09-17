// frontend/src/pages/Login.jsx
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { CircleAlert, Eye, EyeOff, Lock, Mail, Waves } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import Orb from '../components/Orb';
import { GRADIENT_PRESETS } from '../utils/format';
import './Auth.css';

export default function Login() {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { login } = useAuth();

  async function handleSubmit(event) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      await login(identifier.trim(), password);
      // The PublicOnly route guard redirects to the page the user came from.
    } catch (err) {
      setError(err?.detail ?? 'Login failed. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-orbs" aria-hidden="true">
        <Orb gradient={GRADIENT_PRESETS[0]} size={160} className="auth-orb-a" />
        <Orb gradient={GRADIENT_PRESETS[4]} size={110} className="auth-orb-b" />
        <Orb gradient={GRADIENT_PRESETS[3]} size={70} className="auth-orb-c" />
      </div>

      <div className="auth-card">
        <div className="auth-brand">
          <span className="brand-mark" aria-hidden="true">
            <Waves size={16} strokeWidth={2.2} />
          </span>
          <span className="brand-name">VoiceClone</span>
        </div>

        <h1 className="auth-title">Welcome back</h1>
        <p className="auth-subtitle">Sign in to keep generating with your voices.</p>

        <form className="auth-form" onSubmit={handleSubmit} noValidate>
          <div className="field">
            <label className="field-label" htmlFor="identifier">
              Email
            </label>
            <div className="auth-input-wrap">
              <input
                id="identifier"
                className="input"
                type="text"
                placeholder="you@example.com"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                autoComplete="username"
                autoFocus
                required
              />
              <Mail className="auth-input-icon" size={16} strokeWidth={1.8} aria-hidden="true" />
            </div>
          </div>

          <div className="field">
            <label className="field-label" htmlFor="password">
              Password
            </label>
            <div className="auth-input-wrap">
              <input
                id="password"
                className="input"
                type={showPassword ? 'text' : 'password'}
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
                style={{ paddingRight: 40 }}
              />
              <Lock className="auth-input-icon" size={16} strokeWidth={1.8} aria-hidden="true" />
              <button
                type="button"
                className="btn btn-icon auth-toggle"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          {error && (
            <p className="auth-error" role="alert">
              <CircleAlert size={15} aria-hidden="true" />
              <span>{error}</span>
            </p>
          )}

          <button type="submit" className="btn btn-primary auth-submit" disabled={isSubmitting || !identifier || !password}>
            {isSubmitting && <span className="spinner" aria-hidden="true" />}
            {isSubmitting ? 'Signing in…' : 'Sign In'}
          </button>
        </form>

        <p className="auth-footer">
          Don&apos;t have an account? <Link to="/signup">Sign up</Link>
        </p>
      </div>
    </div>
  );
}
