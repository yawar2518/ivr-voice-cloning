// frontend/src/components/UploadVoiceModal.jsx
import { useState } from 'react';
import './UploadVoiceModal.css';

const LANGUAGE_OPTIONS = [
  { value: 'english', label: 'English' },
  { value: 'urdu', label: 'Urdu (Roman)' },
  { value: 'hindi', label: 'Hindi (Roman)' },
  { value: 'bilingual', label: 'Bilingual' }
];

const ACCEPTED_AUDIO_TYPES = '.wav,.mp3,.m4a,audio/wav,audio/mpeg,audio/mp4,audio/x-m4a';

export default function UploadVoiceModal({ onClose, onUpload, isUploading, errors }) {
  const [audioFile, setAudioFile] = useState(null);
  const [displayName, setDisplayName] = useState('');
  const [language, setLanguage] = useState('');
  const [referenceText, setReferenceText] = useState('');

  const canSubmit = !!audioFile && displayName.trim() !== '' && !!language && !isUploading;

  function handleSubmit(event) {
    event.preventDefault();
    if (!canSubmit) return;

    const formData = new FormData();
    formData.append('audio_file', audioFile);
    formData.append('display_name', displayName.trim());
    formData.append('language', language);
    if (referenceText.trim()) {
      formData.append('reference_text', referenceText.trim());
    }

    onUpload(formData);
  }

  return (
    <div className="upload-voice-overlay" onClick={onClose}>
      <div className="upload-voice-modal" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="upload-voice-close" onClick={onClose} aria-label="Close">
          ×
        </button>

        <h2 className="upload-voice-title">Upload New Voice</h2>
        <p className="upload-voice-subtitle">Add a new voice profile for IVR generation.</p>

        <form onSubmit={handleSubmit} noValidate>
          <label className="upload-voice-field">
            <span className="upload-voice-label">Audio file</span>
            <input
              type="file"
              accept={ACCEPTED_AUDIO_TYPES}
              onChange={(e) => setAudioFile(e.target.files?.[0] ?? null)}
              className="upload-voice-file-input"
            />
            {audioFile && <span className="upload-voice-file-name">{audioFile.name}</span>}
            {errors?.audio_file && (
              <span className="upload-voice-field-error">{errors.audio_file.join(' ')}</span>
            )}
          </label>

          <label className="upload-voice-field">
            <span className="upload-voice-label">Display name</span>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="e.g. Sara — English"
              className="upload-voice-text-input"
            />
            {errors?.display_name && (
              <span className="upload-voice-field-error">{errors.display_name.join(' ')}</span>
            )}
          </label>

          <label className="upload-voice-field">
            <span className="upload-voice-label">Language</span>
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              className="upload-voice-select"
            >
              <option value="">Select a language…</option>
              {LANGUAGE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            {errors?.language && (
              <span className="upload-voice-field-error">{errors.language.join(' ')}</span>
            )}
          </label>

          <label className="upload-voice-field">
            <span className="upload-voice-label">Reference text (optional)</span>
            <textarea
              value={referenceText}
              onChange={(e) => setReferenceText(e.target.value)}
              placeholder="Leave empty to auto-transcribe the audio…"
              rows={3}
              className="upload-voice-textarea"
            />
          </label>

          {errors?.non_field && (
            <p className="upload-voice-error" role="alert">
              {errors.non_field.join(' ')}
            </p>
          )}

          <div className="upload-voice-actions">
            <button
              type="button"
              className="upload-voice-btn upload-voice-btn-ghost"
              onClick={onClose}
              disabled={isUploading}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="upload-voice-btn upload-voice-btn-primary"
              disabled={!canSubmit}
            >
              {isUploading ? 'Uploading…' : 'Upload'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
