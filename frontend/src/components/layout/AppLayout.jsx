// frontend/src/components/layout/AppLayout.jsx
import { Outlet, useLocation } from 'react-router-dom';
import Sidebar from './Sidebar';
import TopBar from './TopBar';
import CommandPalette from '../CommandPalette';
import FeedbackModal from '../FeedbackModal';
import PlayerModal from '../PlayerModal';
import UploadVoiceModal from '../UploadVoiceModal';
import { useUI } from '../../context/UIContext';
import './AppLayout.css';

const PAGE_TITLES = {
  '/': 'Home',
  '/tts': 'Text to Speech',
  '/voices': 'Voices',
  '/library': 'Library',
  '/settings': 'Profile Settings'
};

export default function AppLayout() {
  const location = useLocation();
  const { sidebarOpen, paletteOpen, feedbackOpen, playerGeneration, uploadVoiceOpen } = useUI();
  const title = PAGE_TITLES[location.pathname] ?? 'VoiceClone';

  return (
    <div className={sidebarOpen ? 'app-shell' : 'app-shell app-shell-collapsed'}>
      <Sidebar />
      <TopBar title={title} />
      <main className="app-main">
        <div key={location.pathname} className="app-page fade-up">
          <Outlet />
        </div>
      </main>

      {paletteOpen && <CommandPalette />}
      {feedbackOpen && <FeedbackModal />}
      {playerGeneration && <PlayerModal generation={playerGeneration} />}
      {uploadVoiceOpen && <UploadVoiceModal />}
    </div>
  );
}
