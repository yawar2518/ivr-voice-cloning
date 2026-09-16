// frontend/src/context/VoicesContext.jsx
// One shared voice list for the whole app (generation card picker, Voices
// page, command palette) plus the user's currently selected voice, which
// is remembered per browser.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { apiClient } from '../api/client';
import { useAuth } from './AuthContext';
import { useToast } from './ToastContext';

const VoicesContext = createContext(null);
const SELECTED_KEY = 'voiceclone.selectedVoice';
const PROCESSING_POLL_MS = 3000;

function loadSelected() {
  try {
    return localStorage.getItem(SELECTED_KEY) || '';
  } catch {
    return '';
  }
}

export function voiceLabel(voice) {
  return voice?.display_name || 'Untitled voice';
}

export function pickDefaultVoice(voices) {
  return (
    voices.find((v) => !v.is_default && v.is_active && v.status === 'ready') ??
    voices.find((v) => v.is_default && v.status === 'ready') ??
    voices.find((v) => v.status === 'ready') ??
    voices[0] ??
    null
  );
}

export function VoicesProvider({ children }) {
  const { isAuthenticated } = useAuth();
  const { showToast } = useToast();
  const [voices, setVoices] = useState([]);
  const [meta, setMeta] = useState({ voices_used: 0, voice_clone_limit: 3 });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedVoiceId, setSelectedVoiceIdState] = useState(loadSelected);
  const voicesRef = useRef(voices);

  useEffect(() => {
    voicesRef.current = voices;
  }, [voices]);

  const refresh = useCallback(async ({ silent = true } = {}) => {
    if (!silent) setIsLoading(true);
    try {
      const res = await apiClient.getVoiceModels();
      setVoices(res.results);
      setMeta({ voices_used: res.voices_used ?? 0, voice_clone_limit: res.voice_clone_limit ?? 3 });
      setError(null);
      return res.results;
    } catch (err) {
      setError(err?.detail ?? 'Failed to load voices.');
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isAuthenticated) {
      setVoices([]);
      return;
    }
    refresh({ silent: false });
  }, [isAuthenticated, refresh]);

  // Make sure the remembered selection still exists; otherwise fall back.
  useEffect(() => {
    if (voices.length === 0) return;
    const exists = voices.some((v) => v.id === selectedVoiceId);
    if (!exists) {
      const fallback = pickDefaultVoice(voices);
      if (fallback) setSelectedVoiceIdState(fallback.id);
    }
  }, [voices, selectedVoiceId]);

  const setSelectedVoiceId = useCallback((id) => {
    setSelectedVoiceIdState(id);
    try {
      localStorage.setItem(SELECTED_KEY, id);
    } catch {
      // ignore
    }
  }, []);

  // Poll while any clone is still processing, toasting when it settles.
  const hasProcessing = voices.some((v) => v.status === 'processing');
  useEffect(() => {
    if (!hasProcessing) return undefined;
    let cancelled = false;
    let timeoutId;

    async function poll() {
      try {
        const res = await apiClient.getVoiceModels();
        if (cancelled) return;
        const previous = voicesRef.current;
        res.results.forEach((voice) => {
          const before = previous.find((v) => v.id === voice.id);
          if (before?.status !== 'processing') return;
          if (voice.status === 'ready') {
            showToast(`${voiceLabel(voice)} is ready to use.`, 'success');
          } else if (voice.status === 'failed') {
            showToast(voice.error_detail ?? `${voiceLabel(voice)} failed to process.`, 'error');
          }
        });
        setVoices(res.results);
        setMeta({ voices_used: res.voices_used ?? 0, voice_clone_limit: res.voice_clone_limit ?? 3 });
      } catch {
        // transient — keep polling
      }
      if (!cancelled) timeoutId = setTimeout(poll, PROCESSING_POLL_MS);
    }

    timeoutId = setTimeout(poll, PROCESSING_POLL_MS);
    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
    };
  }, [hasProcessing, showToast]);

  const selectedVoice = useMemo(
    () => voices.find((v) => v.id === selectedVoiceId) ?? null,
    [voices, selectedVoiceId]
  );

  const value = useMemo(
    () => ({
      voices,
      isLoading,
      error,
      refresh,
      selectedVoiceId,
      selectedVoice,
      setSelectedVoiceId,
      voicesUsed: meta.voices_used,
      voiceLimit: meta.voice_clone_limit,
      defaultVoices: voices.filter((v) => v.is_default),
      customVoices: voices.filter((v) => !v.is_default)
    }),
    [voices, isLoading, error, refresh, selectedVoiceId, selectedVoice, setSelectedVoiceId, meta]
  );

  return <VoicesContext.Provider value={value}>{children}</VoicesContext.Provider>;
}

export function useVoices() {
  const ctx = useContext(VoicesContext);
  if (!ctx) throw new Error('useVoices must be used within a VoicesProvider');
  return ctx;
}
