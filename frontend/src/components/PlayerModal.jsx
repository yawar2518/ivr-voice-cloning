// frontend/src/components/PlayerModal.jsx
import { useEffect, useState } from 'react';
import { Download, Loader2, Trash2 } from 'lucide-react';
import Modal from './Modal';
import Orb from './Orb';
import AudioPlayer from './AudioPlayer';
import { apiClient } from '../api/client';
import { useUI } from '../context/UIContext';
import { useToast } from '../context/ToastContext';
import { formatDateTime, formatNumber, gradientFor, initials, languageLabel } from '../utils/format';
import './PlayerModal.css';

export function triggerDownload(url) {
  const link = document.createElement('a');
  link.href = url;
  link.rel = 'noopener';
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  setTimeout(() => link.remove(), 1000);
}

export function useDownload() {
  const { showToast } = useToast();
  const [downloading, setDownloading] = useState(null);

  async function download(generationId, format) {
    setDownloading(format);
    try {
      const { download_url: url } = await apiClient.getDownloadUrl(generationId, format);
      triggerDownload(url);
      showToast(`Downloading ${format.toUpperCase()}…`, 'success');
    } catch (err) {
      showToast(err?.detail ?? 'Download failed.', 'error');
    } finally {
      setDownloading(null);
    }
  }

  return { download, downloading };
}

export default function PlayerModal({ generation: initial }) {
  const { closePlayer, bumpGenerations } = useUI();
  const { showToast } = useToast();
  const { download, downloading } = useDownload();
  const [generation, setGeneration] = useState(initial);
  const [isDeleting, setIsDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Refresh so the pre-signed audio URL is fresh and the status is current.
  useEffect(() => {
    let cancelled = false;
    apiClient
      .getGeneration(initial.id)
      .then((fresh) => {
        if (!cancelled) setGeneration(fresh);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [initial.id]);

  const gradient = gradientFor(generation.id);
  const voice = generation.voice_model;
  const isReady = generation.status === 'ready' && generation.audio_url;

  async function handleDelete() {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    setIsDeleting(true);
    try {
      await apiClient.deleteGeneration(generation.id);
      showToast('Generation deleted.', 'success');
      bumpGenerations();
      closePlayer();
    } catch (err) {
      showToast(err?.detail ?? 'Failed to delete generation.', 'error');
      setIsDeleting(false);
      setConfirmDelete(false);
    }
  }

  return (
    <Modal onClose={closePlayer} width={640} className="player-modal" hideClose={false} title={null}>
      <div className="player-modal-hero" style={{ '--card-from': gradient.from, '--card-to': gradient.to }}>
        <Orb gradient={gradient} size={96} />
        <span className="gen-card-badge">Text to Speech</span>
      </div>

      <div className="player-modal-content">
        {isReady ? (
          <AudioPlayer audioUrl={generation.audio_url} durationSeconds={generation.duration_seconds} accent={gradient.from} />
        ) : (
          <div className="player-modal-status">
            {generation.status === 'processing' ? (
              <>
                <Loader2 size={16} className="gen-card-spin" /> Still generating…
              </>
            ) : (
              <>Generation failed{generation.error_detail ? `: ${generation.error_detail}` : '.'}</>
            )}
          </div>
        )}

        <p className="player-modal-text" data-testid="player-text">
          {generation.text}
        </p>

        <dl className="player-modal-meta">
          <div>
            <dt>Voice</dt>
            <dd className="player-modal-voice">
              <span className="avatar avatar-sm">{initials(voice?.display_name ?? 'V')}</span>
              <span>
                {voice?.display_name ?? 'Deleted voice'}
                {voice?.language && <span className="t-muted"> · {languageLabel(voice.language)}</span>}
              </span>
            </dd>
          </div>
          <div>
            <dt>Credits used</dt>
            <dd>{formatNumber(generation.credits_used)}</dd>
          </div>
          <div>
            <dt>Created</dt>
            <dd>{formatDateTime(generation.created_at)}</dd>
          </div>
          <div>
            <dt>Duration</dt>
            <dd>{generation.duration_seconds ? `${Number(generation.duration_seconds).toFixed(1)}s` : '—'}</dd>
          </div>
        </dl>

        <div className="player-modal-actions">
          <div className="player-modal-downloads">
            <button
              type="button"
              className="btn btn-primary"
              disabled={!isReady || downloading !== null}
              onClick={() => download(generation.id, 'mp3')}
            >
              {downloading === 'mp3' ? <span className="spinner" /> : <Download size={15} />}
              Download MP3
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              disabled={!isReady || downloading !== null}
              onClick={() => download(generation.id, 'wav')}
            >
              {downloading === 'wav' ? <span className="spinner spinner-dark" /> : <Download size={15} />}
              Download WAV
            </button>
          </div>
          <button
            type="button"
            className={confirmDelete ? 'btn btn-danger' : 'btn btn-ghost'}
            onClick={handleDelete}
            disabled={isDeleting || generation.status === 'processing'}
            onBlur={() => setConfirmDelete(false)}
          >
            {isDeleting ? <span className="spinner spinner-dark" /> : <Trash2 size={15} />}
            {confirmDelete ? 'Confirm delete' : 'Delete'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
