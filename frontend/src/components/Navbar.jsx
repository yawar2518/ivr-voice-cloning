// frontend/src/components/Navbar.jsx
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import './Navbar.css';

const NAV_LINKS = [
  { to: '/generate', label: 'Generate', roles: ['generator', 'approver', 'admin'] },
  { to: '/prompts', label: 'Prompt Library', roles: ['generator', 'approver', 'admin'] },
  { to: '/audit-log', label: 'Audit Log', roles: ['admin'] } // Section 11: GET /api/audit/ is admin-only
];

export default function Navbar({ animateIn = false }) {
  const { username, role, logout } = useAuth();
  const navigate = useNavigate();

  function handleLogout() {
    logout();
    navigate('/login');
  }

  return (
    <nav className={animateIn ? 'navbar navbar-intro' : 'navbar'}>
      <div className="navbar-brand">
        <span className="navbar-logo-mark" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path
              d="M12 15a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3Z"
              stroke="#fff"
              strokeWidth="1.8"
              strokeLinecap="round"
            />
            <path
              d="M6 11v1a6 6 0 0 0 12 0v-1M12 18v3"
              stroke="#fff"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
        <span className="navbar-wordmark">IVR Voice</span>
      </div>

      <div className="navbar-links">
        {NAV_LINKS.filter((link) => link.roles.includes(role)).map((link) => (
          <NavLink
            key={link.to}
            to={link.to}
            className={({ isActive }) => (isActive ? 'navbar-link navbar-link-active' : 'navbar-link')}
          >
            {link.label}
          </NavLink>
        ))}
      </div>

      <div className="navbar-user">
        <span className="navbar-user-pill">
          {username} <span className="navbar-user-role">· {role}</span>
        </span>
        <button type="button" className="navbar-logout" onClick={handleLogout}>
          Log out
        </button>
      </div>
    </nav>
  );
}
