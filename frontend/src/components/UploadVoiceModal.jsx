// frontend/src/components/UploadVoiceModal.jsx
import { useRef, useState } from 'react';
import { ArrowLeft, Check, FileAudio, Upload, X } from 'lucide-react';
import Modal from './Modal';
import { apiClient } from '../api/client';
import { useUI } from '../context/UIContext';
import { useToast } from '../context/ToastContext';
import { useVoices } from '../context/VoicesContext';
import { useAuth } from '../context/AuthContext';
import './UploadVoiceModal.css';

const LANGUAGE_OPTIONS = [
  { value: 'english', label: 'English' },
  { value: 'urdu', label: 'Urdu (Roman)' },
  { value: 'hindi', label: 'Hindi (Roman)' },
  { value: 'bilingual', label: 'Bilingual' }
];

const AUTO_TRANSCRIBE_LANGUAGES = new Set(['english']);
const ACCEPT = '.mp3,.wav,.m4a,audio/mpeg,audio/wav,audio/x-wav,audio/mp4,audio/x-m4a';
const MAX_SIZE_MB = 50;

function formatBytes(bytes) {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function UploadVoiceModal() {
  const { closeUploadVoice } = useUI();
  const { showToast } = useToast();
  const { refresh, setSelectedVoiceId, voicesUsed, voiceLimit } = useVoices();
  const { refreshProfile } = useAuth();

  const [step, setStep] = useState(1);
  const [file, setFile] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const [name, setName] = useState('');
  const [language, setLanguage] = useState('english');
  const [referenceText, setReferenceText] = useState('');
  const [errors, setErrors] = useState({});
  const [progress, setProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const inputRef = useRef(null);

  const needsTranscript = !AUTO_TRANSCRIBE_LANGUAGES.has(language);
  const limitReached = voicesUsed >= voiceLimit;

  function acceptFile(candidate) {
    if (!candidate) return;
    const okType = /\.(mp3|wav|m4a)$/i.test(candidate.name) || (candidate.type || '').startsWith('audio/');
    if (!okType) {
      setErrors({ audio_file: ['Please choose an MP3, WAV or M4A file.'] });
      return;
    }
    if (candidate.size > MAX_SIZE_MB * 1024 * 1024) {
      setErrors({ audio_file: [`File is too large. Keep it under ${MAX_SIZE_MB} MB.`] });
      return;
    }
    setErrors({});
    setFile(candidate);
    if (!name) {
      setName(candidate.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim());
    }
  }

  function onDrop(event) {
    event.preventDefault();
    setIsDragging(false);
    acceptFile(event.dataTransfer.files?.[0]);
  }

  const canContinue = Boolean(file);
  const canSubmit =
    Boolean(file) && name.trim() !== '' && Boolean(language) && (!needsTranscript || referenceText.trim() !== '') && !isUploading;

  async function handleSubmit(event) {
    event?.preventDefault();
    if (!canSubmit) return;
    setIsUploading(true);
    setErrors({});
    setProgress(0);

    const formData = new FormData();
    formData.append('audio_file', file);
    formData.append('display_name', name.trim());
    formData.append('language', language);
    if (referenceText.trim()) formData.append('reference_text', referenceText.trim());

    try {
      const created = await apiClient.uploadVoiceModel(formData, { onProgress: setProgress });
      await refresh();
      refreshProfile();
      if (created?.id) setSelectedVoiceId(created.id);
      showToast('Voice uploaded — processing your sample…', 'success');
      closeUploadVoice();
    } catch (err) {
      if (err?.error === 'validation_error' && err.detail && typeof err.detail === 'object') {
        setErrors(err.detail);
        if (err.detail.audio_file) setStep(1);
      } else if (err?.error === 'voice_limit_reached') {
        setErrors({ non_field: [err.detail] });
      } else {
        setErrors({ non_field: [err?.detail ?? 'Upload failed. Please try again.'] });
      }
      setIsUploading(false);
    }
  }

  return (
    <Modal
      title="Add Voice Clone"
      subtitle={step === 1 ? 'Step 1 of 2 — Upload a sample' : 'Step 2 of 2 — Voice details'}
      onClose={isUploading ? undefined : closeUploadVoice}
      width={520}
      footer={
        // Keyed so React swaps the buttons instead of morphing "Continue"
        // into the submit button mid-click, which would submit the form
        // with the auto-filled name before the user edits it.
        step === 1 ? (
          <div key="step-1" className="modal-footer-row">
            <button type="button" className="btn btn-ghost" onClick={closeUploadVoice}>
              Cancel
            </button>
            <button type="button" className="btn btn-primary" disabled={!canContinue || limitReached} onClick={() => setStep(2)}>
              Continue
            </button>
          </div>
        ) : (
          <div key="step-2" className="modal-footer-row">
            <button type="button" className="btn btn-ghost" onClick={() => setStep(1)} disabled={isUploading}>
              <ArrowLeft size={14} />
              Back
            </button>
            <button type="button" className="btn btn-primary" disabled={!canSubmit} onClick={handleSubmit}>
              {isUploading ? (
                <>
                  <span className="spinner" /> Uploading {progress}%
                </>
              ) : (
                <>
                  <Upload size={14} /> Upload voice
                </>
              )}
            </button>
          </div>
        )
      }
    >
      <div className="upload-steps" aria-hidden="true">
        <span className={step >= 1 ? 'upload-step upload-step-active' : 'upload-step'}>1</span>
        <span className="upload-step-line" />
        <span className={step >= 2 ? 'upload-step upload-step-active' : 'upload-step'}>2</span>
      </div>

      {limitReached && (
        <div className="upload-limit" role="alert">
          You have used {voicesUsed} of {voiceLimit} voice slots. Upgrade your plan to add more voices.
        </div>
      )}

      {step === 1 && (
        <div className="upload-step-body">
          <div
            className={`dropzone ${isDragging ? 'dropzone-active' : ''} ${file ? 'dropzone-filled' : ''}`}
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={onDrop}
            onClick={() => inputRef.current?.click()}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click();
            }}
          >
            <input
              ref={inputRef}
              type="file"
              accept={ACCEPT}
              className="dropzone-input"
              onChange={(e) => acceptFile(e.target.files?.[0])}
              data-testid="voice-file-input"
            />
            {file ? (
              <div className="dropzone-file">
                <span className="dropzone-file-icon">
                  <FileAudio size={22} strokeWidth={1.8} />
                </span>
                <div className="dropzone-file-copy">
                  <div className="dropzone-file-name">{file.name}</div>
                  <div className="dropzone-file-size">{formatBytes(file.size)}</div>
                </div>
                <button
                  type="button"
                  className="btn btn-icon"
                  aria-label="Remove file"
                  onClick={(e) => {
                    e.stopPropagation();
                    setFile(null);
                  }}
                >
                  <X size={16} />
                </button>
              </div>
            ) : (
              <>
                <span className="dropzone-icon">
                  <Upload size={22} strokeWidth={1.8} />
                </span>
                <div className="dropzone-title">Drag and drop your audio here</div>
                <div className="dropzone-subtitle">Upload a clear voice sample (30 sec – 3 min)</div>
                <div className="dropzone-types">MP3, WAV or M4A · up to {MAX_SIZE_MB} MB</div>
              </>
            )}
          </div>
          {errors.audio_file && <p className="field-error">{errors.audio_file.join(' ')}</p>}
          <ul className="upload-tips">
            <li>
              <Check size={13} /> One speaker, no background music
            </li>
            <li>
              <Check size={13} /> Natural, conversational pace
            </li>
            <li>
              <Check size={13} /> English samples are transcribed automatically
            </li>
          </ul>
        </div>
      )}

      {step === 2 && (
        <form id="upload-voice-form" className="upload-step-body" onSubmit={handleSubmit} noValidate>
          <div className="field">
            <label className="field-label" htmlFor="voice-name">
              Voice name
            </label>
            <input
              id="voice-name"
              className={errors.display_name ? 'input input-error' : 'input'}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Sara — Warm and friendly"
              autoFocus
              maxLength={100}
            />
            {errors.display_name && <span className="field-error">{errors.display_name.join(' ')}</span>}
          </div>

          <div className="field">
            <label className="field-label" htmlFor="voice-language">
              Language
            </label>
            <select id="voice-language" className="select" value={language} onChange={(e) => setLanguage(e.target.value)}>
              {LANGUAGE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            {errors.language && <span className="field-error">{errors.language.join(' ')}</span>}
          </div>

          <div className="field">
            <label className="field-label" htmlFor="voice-reference">
              Reference text {needsTranscript ? '' : <span className="t-muted">(optional)</span>}
            </label>
            <textarea
              id="voice-reference"
              className={errors.reference_text ? 'textarea input-error' : 'textarea'}
              rows={3}
              value={referenceText}
              onChange={(e) => setReferenceText(e.target.value)}
              placeholder={
                needsTranscript
                  ? 'Required — type exactly what is spoken in the sample, in Roman script.'
                  : 'Type what is spoken in the sample to override automatic transcription.'
              }
            />
            <span className="field-hint">
              {needsTranscript
                ? 'Automatic transcription is English-only, so this language needs a typed transcript.'
                : 'Leave empty and we will transcribe the sample for you.'}
            </span>
            {errors.reference_text && <span className="field-error">{errors.reference_text.join(' ')}</span>}
          </div>

          {isUploading && (
            <div className="progress upload-progress" aria-label="Upload progress">
              <div className="progress-bar" style={{ width: `${progress}%` }} />
            </div>
          )}

          {errors.non_field && (
            <p className="field-error" role="alert">
              {errors.non_field.join(' ')}
            </p>
          )}
        </form>
      )}
    </Modal>
  );
}
