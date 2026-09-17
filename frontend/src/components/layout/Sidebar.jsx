// frontend/src/components/layout/Sidebar.jsx
import { NavLink } from 'react-router-dom';
import { AudioLines, Home, Library, Mic, User, Waves } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { formatNumber, tierLabel } from '../../utils/format';

function NavItem({ to, icon: Icon, label, end }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) => (isActive ? 'nav-item nav-item-active' : 'nav-item')}
    >
      <Icon size={16} strokeWidth={1.9} className="nav-icon" aria-hidden="true" />
      <span>{label}</span>
    </NavLink>
  );
}

export default function Sidebar() {
  const { user, username, tier } = useAuth();
  const used = user?.credits_used ?? 0;
  const limit = user?.credits_limit ?? 5000;
  const ratio = limit > 0 ? Math.min(1, used / limit) : 0;
  const circumference = 2 * Math.PI * 9;

  return (
    <aside className="sidebar" aria-label="Primary">
      <div className="sidebar-brand">
        <span className="brand-mark" aria-hidden="true">
          <Waves size={16} strokeWidth={2.2} />
        </span>
        <span className="brand-name">VoiceClone</span>
      </div>

      <nav className="sidebar-nav">
        <NavItem to="/" icon={Home} label="Home" end />
        <div className="nav-separator" />
        <NavItem to="/voices" icon={Mic} label="Voices" />
        <NavItem to="/library" icon={Library} label="Library" />
        <div className="nav-separator" />
        <div className="nav-section-label">Pinned</div>
        <NavItem to="/tts" icon={AudioLines} label="Text to Speech" />
      </nav>

      <div className="sidebar-bottom">
        <div className="nav-separator" />
        <NavItem to="/settings" icon={User} label="Profile" />

        <NavLink to="/settings" className="credits-indicator" aria-label="Credits">
          <span className="credits-ring" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="24" height="24">
              <circle cx="12" cy="12" r="9" fill="none" stroke="#fed7aa" strokeWidth="3" />
              <circle
                cx="12"
                cy="12"
                r="9"
                fill="none"
                stroke="#f97316"
                strokeWidth="3"
                strokeLinecap="round"
                strokeDasharray={circumference}
                strokeDashoffset={circumference * (1 - ratio)}
                transform="rotate(-90 12 12)"
                style={{ transition: 'stroke-dashoffset 400ms ease' }}
              />
            </svg>
          </span>
          <span className="credits-copy">
            <span className="credits-value">
              {formatNumber(Math.max(0, limit - used))} <span className="t-muted">credits left</span>
            </span>
            <span className="credits-plan">
              {tierLabel(tier)} plan · {username}
            </span>
          </span>
        </NavLink>
      </div>
    </aside>
  );
}
