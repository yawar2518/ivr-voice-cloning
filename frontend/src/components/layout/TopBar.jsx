// frontend/src/components/layout/TopBar.jsx
import { useEffect, useRef, useState } from 'react';
import { Bell, Folder, PanelLeft, Search } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useUI } from '../../context/UIContext';
import { useToast } from '../../context/ToastContext';
import { initials } from '../../utils/format';
import ProfileDropdown from './ProfileDropdown';

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);

export default function TopBar({ title }) {
  const { username } = useAuth();
  const { toggleSidebar, openPalette, openFeedback } = useUI();
  const { showToast } = useToast();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    if (!menuOpen) return undefined;
    function onClick(event) {
      if (menuRef.current && !menuRef.current.contains(event.target)) setMenuOpen(false);
    }
    function onKey(event) {
      if (event.key === 'Escape') setMenuOpen(false);
    }
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [menuOpen]);

  return (
    <header className="topbar">
      <div className="topbar-left">
        <button type="button" className="btn btn-icon" onClick={toggleSidebar} aria-label="Toggle sidebar">
          <PanelLeft size={17} strokeWidth={1.9} />
        </button>
        <span className="topbar-title">{title}</span>
      </div>

      <div className="topbar-center">
        <button type="button" className="search-pill" onClick={openPalette} aria-label="Search everything">
          <Search size={15} strokeWidth={2} aria-hidden="true" />
          <span className="search-placeholder">Search everything...</span>
          <span className="search-kbd" aria-hidden="true">
            <kbd>{isMac ? '⌘' : 'Ctrl'}</kbd>
            <kbd>K</kbd>
          </span>
        </button>
      </div>

      <div className="topbar-right">
        <button type="button" className="btn btn-secondary btn-sm topbar-pill" onClick={openFeedback}>
          Feedback
        </button>
        <a
          className="btn btn-secondary btn-sm topbar-pill"
          href="https://github.com"
          target="_blank"
          rel="noreferrer"
          onClick={(e) => {
            e.preventDefault();
            showToast('Documentation is coming soon.', 'info');
          }}
        >
          Docs
        </a>
        <button
          type="button"
          className="btn btn-icon"
          aria-label="Files"
          onClick={() => showToast('Projects and folders are coming soon.', 'info')}
        >
          <Folder size={17} strokeWidth={1.9} />
        </button>
        <button
          type="button"
          className="btn btn-icon"
          aria-label="Notifications"
          onClick={() => showToast('You are all caught up.', 'info')}
        >
          <Bell size={17} strokeWidth={1.9} />
        </button>

        <div className="topbar-avatar-wrap" ref={menuRef}>
          <button
            type="button"
            className="topbar-avatar"
            onClick={() => setMenuOpen((v) => !v)}
            aria-label="Account menu"
            aria-expanded={menuOpen}
            data-testid="avatar-button"
          >
            <span className="avatar avatar-sm topbar-avatar-inner">{initials(username ?? '')}</span>
          </button>
          {menuOpen && <ProfileDropdown onClose={() => setMenuOpen(false)} />}
        </div>
      </div>
    </header>
  );
}
