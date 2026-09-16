// frontend/src/pages/Settings.jsx
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LogOut, Mic, Zap } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { useVoices } from '../context/VoicesContext';
import { formatDateTime, formatNumber, initials, tierLabel } from '../utils/format';
import './Settings.css';

const PLANS = [
  { id: 'free', name: 'Free', credits: 5000, voices: 3, price: '$0' },
  { id: 'pro', name: 'Pro', credits: 100000, voices: 10, price: '$22' },
  { id: 'scale', name: 'Scale', credits: 500000, voices: 30, price: '$99' }
];

export default function Settings() {
  const { user, username, email, tier, updateProfile, refreshProfile, logout } = useAuth();
  const { voicesUsed, voiceLimit } = useVoices();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [form, setForm] = useState({ username: username ?? '', email: email ?? '' });
  const [errors, setErrors] = useState({});
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    refreshProfile();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setForm({ username: username ?? '', email: email ?? '' });
  }, [username, email]);

  const dirty = form.username.trim() !== (username ?? '') || form.email.trim() !== (email ?? '');
  const used = user?.credits_used ?? 0;
  const limit = user?.credits_limit ?? 5000;
  const percent = limit ? Math.min(100, Math.round((used / limit) * 100)) : 0;

  async function handleSave(event) {
    event.preventDefault();
    setErrors({});
    setIsSaving(true);
    try {
      await updateProfile({ username: form.username.trim(), email: form.email.trim() });
      showToast('Profile updated.', 'success');
    } catch (err) {
      if (err?.error === 'validation_error' && typeof err.detail === 'object') setErrors(err.detail);
      else showToast(err?.detail ?? 'Failed to update profile.', 'error');
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="settings">
      <div className="page-header">
        <div className="page-header-copy">
          <h1 className="page-title">Profile Settings</h1>
          <p className="page-subtitle">Manage your account, plan and usage.</p>
        </div>
      </div>

      <div className="settings-grid">
        <section className="card settings-card">
          <div className="settings-identity">
            <span className="avatar avatar-xl">{initials(username ?? '')}</span>
            <div>
              <div className="settings-name">{username}</div>
              <div className="settings-email">{email}</div>
              <div className="settings-joined">Member since {user?.date_joined ? formatDateTime(user.date_joined) : '—'}</div>
            </div>
          </div>

          <form className="settings-form" onSubmit={handleSave} noValidate>
            <div className="field">
              <label className="field-label" htmlFor="settings-username">
                Username
              </label>
              <input
                id="settings-username"
                className={errors.username ? 'input input-error' : 'input'}
                value={form.username}
                onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))}
              />
              {errors.username && <span className="field-error">{errors.username.join(' ')}</span>}
            </div>
            <div className="field">
              <label className="field-label" htmlFor="settings-email">
                Email
              </label>
              <input
                id="settings-email"
                className={errors.email ? 'input input-error' : 'input'}
                type="email"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              />
              {errors.email && <span className="field-error">{errors.email.join(' ')}</span>}
            </div>
            <div className="settings-form-actions">
              <button type="submit" className="btn btn-primary" disabled={!dirty || isSaving}>
                {isSaving && <span className="spinner" />}
                Save changes
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => {
                  logout();
                  navigate('/login');
                }}
              >
                <LogOut size={15} /> Log out
              </button>
            </div>
          </form>
        </section>

        <section className="card settings-card">
          <div className="settings-section-head">
            <h2 className="t-h2">Plan &amp; usage</h2>
            <span className="pill pill-dark">{tierLabel(tier)} Tier</span>
          </div>

          <div className="usage">
            <div className="usage-row">
              <span>Credits</span>
              <span className="usage-value">
                {formatNumber(used)} / {formatNumber(limit)} used
              </span>
            </div>
            <div className="progress">
              <div className="progress-bar" style={{ width: `${percent}%` }} />
            </div>
            <div className="usage-hint">
              {formatNumber(Math.max(0, limit - used))} credits left · resets{' '}
              {user?.credits_reset_date ? formatDateTime(user.credits_reset_date) : 'in 30 days'}
            </div>
          </div>

          <div className="usage">
            <div className="usage-row">
              <span>
                <Mic size={14} style={{ verticalAlign: -2, marginRight: 6 }} />
                Custom voices
              </span>
              <span className="usage-value">
                {voicesUsed} / {voiceLimit} used
              </span>
            </div>
            <div className="progress">
              <div className="progress-bar" style={{ width: `${voiceLimit ? Math.min(100, (voicesUsed / voiceLimit) * 100) : 0}%` }} />
            </div>
          </div>

          <div className="plans">
            {PLANS.map((plan) => {
              const current = plan.id === tier;
              return (
                <div key={plan.id} className={current ? 'plan plan-current' : 'plan'}>
                  <div className="plan-head">
                    <span className="plan-name">{plan.name}</span>
                    <span className="plan-price">
                      {plan.price}
                      <span className="t-muted">/mo</span>
                    </span>
                  </div>
                  <ul className="plan-perks">
                    <li>{formatNumber(plan.credits)} credits / month</li>
                    <li>{plan.voices} custom voices</li>
                  </ul>
                  <button
                    type="button"
                    className={current ? 'btn btn-secondary btn-sm btn-block' : 'btn btn-primary btn-sm btn-block'}
                    disabled={current}
                    onClick={() => {
                      console.info('[VoiceClone] upgrade requested', { from: tier, to: plan.id });
                      showToast(`Upgrades to ${plan.name} are coming soon.`, 'info');
                    }}
                  >
                    {current ? (
                      'Current plan'
                    ) : (
                      <>
                        <Zap size={13} /> Upgrade
                      </>
                    )}
                  </button>
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
}
