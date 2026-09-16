// frontend/src/pages/Voices.jsx
import { useEffect, useRef, useState } from 'react';
import { Check, Loader2, MoreHorizontal, Pause, Pencil, Play, Plus, Trash2, TriangleAlert } from 'lucide-react';
import { apiClient } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useUI } from '../context/UIContext';
import { useToast } from '../context/ToastContext';
import { useVoices, voiceLabel } from '../context/VoicesContext';
import { VoiceCardSkeleton } from '../components/Skeleton';
import { gradientFor, initials, languageLabel, relativeTime } from '../utils/format';
import './Voices.css';

function usePreviewPlayer() {
  const audioRef = useRef(null);
  const [playingId, setPlayingId] = useState(null);

  useEffect(() => {
    return () => {
      audioRef.current?.pause();
    };
  }, []);

  function toggle(voice) {
    if (!voice.audio_url) return;
    if (playingId === voice.id) {
      audioRef.current?.pause();
      setPlayingId(null);
      return;
    }
    audioRef.current?.pause();
    const audio = new Audio(voice.audio_url);
    audio.onended = () => setPlayingId(null);
    audio.onerror = () => setPlayingId(null);
    audioRef.current = audio;
    audio.play().catch(() => setPlayingId(null));
    setPlayingId(voice.id);
  }

  return { playingId, toggle };
}

function VoiceCard({ voice, isSelected, isPlaying, onPlay, onSelect, onDelete, onRename }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);
  const gradient = gradientFor(voice.id);
  const ready = voice.status === 'ready';

  useEffect(() => {
    if (!menuOpen) return undefined;
    function onClick(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false);
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [menuOpen]);

  return (
    <div className={`voice-card card ${isSelected ? 'voice-card-selected' : ''}`} data-testid="voice-card">
      <div className="voice-card-top">
        <span className="avatar avatar-lg" style={{ background: `linear-gradient(135deg, ${gradient.from}, ${gradient.to})` }}>
          {initials(voice.display_name)}
        </span>
        {!voice.is_default && (
          <div className="voice-card-menu-wrap" ref={menuRef}>
            <button
              type="button"
              className="btn btn-icon"
              aria-label="Voice options"
              onClick={() => setMenuOpen((v) => !v)}
              aria-expanded={menuOpen}
            >
              <MoreHorizontal size={17} />
            </button>
            {menuOpen && (
              <div className="menu voice-card-menu" role="menu">
                <button
                  type="button"
                  className="menu-item"
                  onClick={() => {
                    setMenuOpen(false);
                    onRename(voice);
                  }}
                >
                  <Pencil size={14} /> Rename
                </button>
                <button
                  type="button"
                  className="menu-item menu-item-danger"
                  onClick={() => {
                    setMenuOpen(false);
                    onDelete(voice);
                  }}
                >
                  <Trash2 size={14} /> Delete
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="voice-card-body">
        <h3 className="voice-card-name" title={voice.display_name}>
          {voiceLabel(voice)}
        </h3>
        <div className="voice-card-badges">
          {voice.is_default ? <span className="pill">Default</span> : <span className="pill pill-accent">Custom</span>}
          <span className="pill pill-outline">{languageLabel(voice.language)}</span>
          {voice.status === 'processing' && (
            <span className="pill">
              <Loader2 size={12} className="gen-card-spin" /> Processing
            </span>
          )}
          {voice.status === 'failed' && (
            <span className="pill pill-danger">
              <TriangleAlert size={12} /> Failed
            </span>
          )}
        </div>
        <p className="voice-card-meta">
          {voice.is_default ? 'Provided by VoiceClone' : `Added ${relativeTime(voice.created_at)}`}
        </p>
        {voice.status === 'failed' && voice.error_detail && (
          <p className="voice-card-error" title={voice.error_detail}>
            {voice.error_detail}
          </p>
        )}
      </div>

      <div className="voice-card-actions">
        <button
          type="button"
          className="btn btn-secondary btn-sm voice-card-play"
          onClick={() => onPlay(voice)}
          disabled={!voice.audio_url}
          aria-label={isPlaying ? 'Pause preview' : 'Play preview'}
        >
          {isPlaying ? <Pause size={14} fill="currentColor" /> : <Play size={14} fill="currentColor" />}
          {isPlaying ? 'Pause' : 'Preview'}
        </button>
        <button
          type="button"
          className={isSelected ? 'btn btn-primary btn-sm voice-card-select' : 'btn btn-secondary btn-sm voice-card-select'}
          onClick={() => onSelect(voice)}
          disabled={!ready}
        >
          {isSelected ? (
            <>
              <Check size={14} /> Selected
            </>
          ) : (
            'Select'
          )}
        </button>
      </div>
    </div>
  );
}

export default function Voices() {
  const { isLoading, error, refresh, selectedVoiceId, setSelectedVoiceId, voicesUsed, voiceLimit, defaultVoices, customVoices } =
    useVoices();
  const { openUploadVoice } = useUI();
  const { showToast } = useToast();
  const { refreshProfile } = useAuth();
  const { playingId, toggle } = usePreviewPlayer();
  const [pendingDeleteId, setPendingDeleteId] = useState(null);

  const limitReached = voicesUsed >= voiceLimit;

  async function handleSelect(voice) {
    setSelectedVoiceId(voice.id);
    if (!voice.is_default) {
      try {
        await apiClient.activateVoiceModel(voice.id);
        refresh();
      } catch {
        // selection is remembered locally regardless
      }
    }
    showToast(`${voiceLabel(voice)} is now your active voice.`, 'success');
  }

  async function handleDelete(voice) {
    const confirmed = window.confirm(`Delete "${voiceLabel(voice)}"? This cannot be undone.`);
    if (!confirmed) return;
    setPendingDeleteId(voice.id);
    try {
      await apiClient.deleteVoiceModel(voice.id);
      await refresh();
      refreshProfile();
      showToast('Voice deleted.', 'success');
    } catch (err) {
      showToast(err?.detail ?? 'Failed to delete voice.', 'error');
    } finally {
      setPendingDeleteId(null);
    }
  }

  function handleRename() {
    showToast('Renaming voices is coming soon. Delete and re-upload to change the name.', 'info');
  }

  function handleAdd() {
    if (limitReached) {
      showToast(`You have used all ${voiceLimit} voice slots. Upgrade your plan to add more voices.`, 'error');
      return;
    }
    openUploadVoice();
  }

  return (
    <div className="voices-page">
      <div className="page-header">
        <div className="page-header-copy">
          <h1 className="page-title">My Voices</h1>
          <p className="page-subtitle" data-testid="voices-usage">
            {voicesUsed} / {voiceLimit} voices used
          </p>
        </div>
        <button type="button" className="btn btn-primary" onClick={handleAdd} data-testid="add-voice-button">
          <Plus size={16} /> Add Voice
        </button>
      </div>

      {error && (
        <div className="gen-error" role="alert">
          {error}
        </div>
      )}

      {isLoading ? (
        <div className="voices-grid">
          {Array.from({ length: 4 }).map((_, i) => (
            <VoiceCardSkeleton key={i} />
          ))}
        </div>
      ) : (
        <div className="voices-grid">
          <button
            type="button"
            className={`voice-add-card ${limitReached ? 'voice-add-card-disabled' : ''}`}
            onClick={handleAdd}
            data-testid="add-voice-card"
          >
            <span className="voice-add-icon">
              <Plus size={22} />
            </span>
            <span className="voice-add-title">Add Voice</span>
            <span className="voice-add-sub">
              {voicesUsed} of {voiceLimit} slots used
            </span>
            {limitReached && <span className="pill pill-accent">Upgrade for more</span>}
          </button>

          {customVoices.map((voice) => (
            <VoiceCard
              key={voice.id}
              voice={voice}
              isSelected={voice.id === selectedVoiceId}
              isPlaying={playingId === voice.id}
              onPlay={toggle}
              onSelect={handleSelect}
              onDelete={handleDelete}
              onRename={handleRename}
            />
          ))}

          {defaultVoices.map((voice) => (
            <VoiceCard
              key={voice.id}
              voice={voice}
              isSelected={voice.id === selectedVoiceId}
              isPlaying={playingId === voice.id}
              onPlay={toggle}
              onSelect={handleSelect}
              onDelete={() => {}}
              onRename={() => {}}
            />
          ))}
        </div>
      )}

      {pendingDeleteId && <div className="voices-busy">Deleting…</div>}
    </div>
  );
}
