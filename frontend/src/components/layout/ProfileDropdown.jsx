// frontend/src/components/layout/ProfileDropdown.jsx
import { useNavigate } from 'react-router-dom';
import { LogOut, Settings, Zap } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { formatNumber, initials, tierLabel } from '../../utils/format';

export default function ProfileDropdown({ onClose }) {
  const { user, username, email, tier, logout } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();

  const used = user?.credits_used ?? 0;
  const limit = user?.credits_limit ?? 5000;
  const percent = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;

  function handleLogout() {
    onClose?.();
    logout();
    navigate('/login');
  }

  function handleUpgrade() {
    console.info('[VoiceClone] upgrade requested', { username, tier });
    showToast('Plan upgrades are coming soon. You are on the ' + tierLabel(tier) + ' plan.', 'info');
    onClose?.();
  }

  return (
    <div className="menu profile-menu" role="menu" data-testid="profile-dropdown">
      <div className="profile-menu-header">
        <span className="avatar">{initials(username ?? '')}</span>
        <div className="profile-menu-identity">
          <div className="profile-menu-name">{username}</div>
          <div className="profile-menu-email">{email}</div>
        </div>
      </div>

      <div className="menu-separator" />

      <div className="profile-menu-plan">
        <div className="profile-menu-row">
          <span className="t-secondary">Plan</span>
          <span className="pill pill-outline">{tierLabel(tier)} Tier</span>
        </div>
        <div className="profile-menu-row">
          <span className="t-secondary">Credits</span>
          <span className="profile-menu-credits" data-testid="credits-used">
            {formatNumber(used)} / {formatNumber(limit)} used
          </span>
        </div>
        <div className="progress" aria-label={`${percent}% of credits used`}>
          <div className="progress-bar" style={{ width: `${percent}%` }} />
        </div>
        <button type="button" className="btn btn-primary btn-sm btn-block" onClick={handleUpgrade}>
          <Zap size={14} />
          {tier === 'free' ? 'Upgrade to Pro' : tier === 'pro' ? 'Upgrade to Scale' : 'Manage plan'}
        </button>
      </div>

      <div className="menu-separator" />

      <button
        type="button"
        className="menu-item"
        role="menuitem"
        onClick={() => {
          onClose?.();
          navigate('/settings');
        }}
      >
        <Settings size={15} />
        Profile Settings
      </button>

      <div className="menu-separator" />

      <button type="button" className="menu-item" role="menuitem" onClick={handleLogout}>
        <LogOut size={15} />
        Log out
      </button>
    </div>
  );
}
