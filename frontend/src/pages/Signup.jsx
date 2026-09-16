// frontend/src/pages/Signup.jsx
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { CircleAlert, Eye, EyeOff, Lock, Mail, Sparkles, User, Waves } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import Orb from '../components/Orb';
import { GRADIENT_PRESETS } from '../utils/format';
import './Auth.css';

function scorePassword(password) {
  if (!password) return { score: 0, label: '' };
  let score = 0;
  if (password.length >= 8) score += 1;
  if (password.length >= 12) score += 1;
  if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score += 1;
  if (/\d/.test(password) || /[^A-Za-z0-9]/.test(password)) score += 1;
  const labels = ['', 'Weak', 'Fair', 'Good', 'Strong'];
  return { score: Math.min(4, score), label: labels[Math.min(4, score)] };
}

export default function Signup() {
  const [form, setForm] = useState({ username: '', email: '', password: '', confirmPassword: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({});
  const [error, setError] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { register } = useAuth();
  const strength = useMemo(() => scorePassword(form.password), [form.password]);

  const mismatch = form.confirmPassword !== '' && form.confirmPassword !== form.password;
  const canSubmit = form.username.trim() && form.email.trim() && form.password.length >= 8 && !mismatch && !isSubmitting;

  function update(field) {
    return (e) => {
      setForm((prev) => ({ ...prev, [field]: e.target.value }));
      setFieldErrors((prev) => ({ ...prev, [field === 'confirmPassword' ? 'confirm_password' : field]: undefined }));
    };
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (!canSubmit) return;
    setError(null);
    setFieldErrors({});
    setIsSubmitting(true);
    try {
      await register({
        username: form.username.trim(),
        email: form.email.trim(),
        password: form.password,
        confirmPassword: form.confirmPassword
      });
      // The PublicOnly route guard redirects to the dashboard.
    } catch (err) {
      if (err?.error === 'validation_error' && err.detail && typeof err.detail === 'object') {
        setFieldErrors(err.detail);
        const first = Object.values(err.detail)[0];
        setError(Array.isArray(first) ? first[0] : String(first));
      } else {
        setError(err?.detail ?? 'Could not create your account. Please try again.');
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-orbs" aria-hidden="true">
        <Orb gradient={GRADIENT_PRESETS[3]} size={150} className="auth-orb-a" />
        <Orb gradient={GRADIENT_PRESETS[2]} size={100} className="auth-orb-b" />
        <Orb gradient={GRADIENT_PRESETS[1]} size={70} className="auth-orb-c" />
      </div>

      <div className="auth-card">
        <div className="auth-brand">
          <span className="brand-mark" aria-hidden="true">
            <Waves size={16} strokeWidth={2.2} />
          </span>
          <span className="brand-name">VoiceClone</span>
        </div>

        <h1 className="auth-title">Create your account</h1>
        <p className="auth-subtitle">Clone voices and generate speech in seconds.</p>

        <p className="auth-perk">
          <Sparkles size={15} aria-hidden="true" />
          Start with 5,000 free credits every month
        </p>

        <form className="auth-form" onSubmit={handleSubmit} noValidate>
          <div className="field">
            <label className="field-label" htmlFor="username">
              Username
            </label>
            <div className="auth-input-wrap">
              <input
                id="username"
                className={fieldErrors.username ? 'input input-error' : 'input'}
                type="text"
                placeholder="yourname"
                value={form.username}
                onChange={update('username')}
                autoComplete="username"
                autoFocus
                required
              />
              <User className="auth-input-icon" size={16} strokeWidth={1.8} aria-hidden="true" />
            </div>
            {fieldErrors.username && <span className="field-error">{fieldErrors.username.join(' ')}</span>}
          </div>

          <div className="field">
            <label className="field-label" htmlFor="email">
              Email
            </label>
            <div className="auth-input-wrap">
              <input
                id="email"
                className={fieldErrors.email ? 'input input-error' : 'input'}
                type="email"
                placeholder="you@example.com"
                value={form.email}
                onChange={update('email')}
                autoComplete="email"
                required
              />
              <Mail className="auth-input-icon" size={16} strokeWidth={1.8} aria-hidden="true" />
            </div>
            {fieldErrors.email && <span className="field-error">{fieldErrors.email.join(' ')}</span>}
          </div>

          <div className="field">
            <label className="field-label" htmlFor="password">
              Password
            </label>
            <div className="auth-input-wrap">
              <input
                id="password"
                className={fieldErrors.password ? 'input input-error' : 'input'}
                type={showPassword ? 'text' : 'password'}
                placeholder="At least 8 characters"
                value={form.password}
                onChange={update('password')}
                autoComplete="new-password"
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
            {form.password && (
              <div className={`strength strength-${strength.score}`} aria-live="polite">
                <div className="strength-bars" aria-hidden="true">
                  <span className="strength-bar" />
                  <span className="strength-bar" />
                  <span className="strength-bar" />
                  <span className="strength-bar" />
                </div>
                <span className="strength-label">Password strength: {strength.label}</span>
              </div>
            )}
            {fieldErrors.password && <span className="field-error">{fieldErrors.password.join(' ')}</span>}
          </div>

          <div className="field">
            <label className="field-label" htmlFor="confirm-password">
              Confirm password
            </label>
            <div className="auth-input-wrap">
              <input
                id="confirm-password"
                className={mismatch || fieldErrors.confirm_password ? 'input input-error' : 'input'}
                type={showPassword ? 'text' : 'password'}
                placeholder="Repeat your password"
                value={form.confirmPassword}
                onChange={update('confirmPassword')}
                autoComplete="new-password"
                required
              />
              <Lock className="auth-input-icon" size={16} strokeWidth={1.8} aria-hidden="true" />
            </div>
            {mismatch && <span className="field-error">Passwords do not match.</span>}
            {fieldErrors.confirm_password && <span className="field-error">{fieldErrors.confirm_password.join(' ')}</span>}
          </div>

          {error && (
            <p className="auth-error" role="alert">
              <CircleAlert size={15} aria-hidden="true" />
              <span>{error}</span>
            </p>
          )}

          <button type="submit" className="btn btn-primary auth-submit" disabled={!canSubmit}>
            {isSubmitting && <span className="spinner" aria-hidden="true" />}
            {isSubmitting ? 'Creating account…' : 'Create Account'}
          </button>
        </form>

        <p className="auth-footer">
          Already have an account? <Link to="/login">Sign in</Link>
        </p>
      </div>
    </div>
  );
}
