// frontend/src/context/UIContext.jsx
// App-shell state shared across pages: sidebar, command palette, feedback
// modal, the global player modal and a "generations changed" counter so
// every list refetches after a new generation or a delete.
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

const UIContext = createContext(null);

const SIDEBAR_KEY = 'voiceclone.sidebar';

function loadSidebar() {
  const narrow = typeof window !== 'undefined' && window.innerWidth < 900;
  try {
    const stored = localStorage.getItem(SIDEBAR_KEY);
    if (stored) return stored !== 'closed';
  } catch {
    // ignore
  }
  return !narrow;
}

export function UIProvider({ children }) {
  const [sidebarOpen, setSidebarOpen] = useState(loadSidebar);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [uploadVoiceOpen, setUploadVoiceOpen] = useState(false);
  const [playerGeneration, setPlayerGeneration] = useState(null);
  const [generationsVersion, setGenerationsVersion] = useState(0);

  useEffect(() => {
    try {
      localStorage.setItem(SIDEBAR_KEY, sidebarOpen ? 'open' : 'closed');
    } catch {
      // ignore
    }
  }, [sidebarOpen]);

  const toggleSidebar = useCallback(() => setSidebarOpen((v) => !v), []);
  const openPalette = useCallback(() => setPaletteOpen(true), []);
  const closePalette = useCallback(() => setPaletteOpen(false), []);
  const openFeedback = useCallback(() => setFeedbackOpen(true), []);
  const closeFeedback = useCallback(() => setFeedbackOpen(false), []);
  const openUploadVoice = useCallback(() => setUploadVoiceOpen(true), []);
  const closeUploadVoice = useCallback(() => setUploadVoiceOpen(false), []);
  const openPlayer = useCallback((generation) => setPlayerGeneration(generation), []);
  const closePlayer = useCallback(() => setPlayerGeneration(null), []);
  const bumpGenerations = useCallback(() => setGenerationsVersion((v) => v + 1), []);

  // Global ⌘K / Ctrl+K shortcut for the command palette.
  useEffect(() => {
    function onKeyDown(event) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setPaletteOpen((v) => !v);
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const value = useMemo(
    () => ({
      sidebarOpen,
      toggleSidebar,
      paletteOpen,
      openPalette,
      closePalette,
      feedbackOpen,
      openFeedback,
      closeFeedback,
      uploadVoiceOpen,
      openUploadVoice,
      closeUploadVoice,
      playerGeneration,
      openPlayer,
      closePlayer,
      generationsVersion,
      bumpGenerations
    }),
    [
      sidebarOpen,
      toggleSidebar,
      paletteOpen,
      openPalette,
      closePalette,
      feedbackOpen,
      openFeedback,
      closeFeedback,
      uploadVoiceOpen,
      openUploadVoice,
      closeUploadVoice,
      playerGeneration,
      openPlayer,
      closePlayer,
      generationsVersion,
      bumpGenerations
    ]
  );

  return <UIContext.Provider value={value}>{children}</UIContext.Provider>;
}

export function useUI() {
  const ctx = useContext(UIContext);
  if (!ctx) throw new Error('useUI must be used within a UIProvider');
  return ctx;
}
