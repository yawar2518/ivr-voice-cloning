// frontend/src/pages/Generate.jsx
import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { apiClient } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useGenerateJob } from '../hooks/useGenerateJob';
import { useToast } from '../context/ToastContext';
import AudioPlayer from '../components/AudioPlayer';
import Navbar from '../components/Navbar';
import ShinyButton from '../components/ShinyButton';
import VoiceProfileSidebar from '../components/VoiceProfileSidebar';
import UploadVoiceModal from '../components/UploadVoiceModal';
import './Generate.css';

const MAX_TEXT_LENGTH = 500; // contract Section 15

function voiceModelLabel(model) {
  return model.display_name ?? `${model.provider} — ${model.model_variant} (${model.version_label})`;
}

export default function Generate() {
  const location = useLocation();
  // Play the splash→navbar→card entrance only right after a fresh login
  // (Login.jsx sets this via navigate state); never on a later visit/refresh.
  const [playIntro] = useState(() => Boolean(location.state?.justLoggedIn));
  const { role } = useAuth();
  const { showToast } = useToast();
  const canManageVoices = role === 'admin';

  const [text, setText] = useState('');

  const [voiceModels, setVoiceModels] = useState([]);
  const [selectedVoiceModelId, setSelectedVoiceModelId] = useState('');
  const [isLoadingVoiceModels, setIsLoadingVoiceModels] = useState(true);
  const [voiceModelsError, setVoiceModelsError] = useState(null);
  const [pendingActivateId, setPendingActivateId] = useState(null);
  const [pendingDeleteId, setPendingDeleteId] = useState(null);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadErrors, setUploadErrors] = useState(null);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitErrors, setSubmitErrors] = useState(null);
  const [job, setJob] = useState(null);

  const isOverLimit = text.length > MAX_TEXT_LENGTH;
  const canSubmit = text.trim() !== '' && !isOverLimit && !!selectedVoiceModelId && !isSubmitting;

  const {
    status: jobStatus,
    result: jobResult,
    error: jobPollError,
    timedOut: jobTimedOut
  } = useGenerateJob(job?.job_id ?? null);

  useEffect(() => {
    let cancelled = false;

    setIsLoadingVoiceModels(true);
    setVoiceModelsError(null);

    apiClient
      .getVoiceModels()
      .then((res) => {
        if (cancelled) return;
        const models = res.results;
        setVoiceModels(models);

        const activeModel = models.find((m) => m.is_active);
        setSelectedVoiceModelId((activeModel ?? models[0])?.id ?? '');
      })
      .catch((err) => {
        if (cancelled) return;
        setVoiceModelsError(err?.detail ?? 'Failed to load voice models.');
      })
      .finally(() => {
        if (cancelled) return;
        setIsLoadingVoiceModels(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // Re-fetches the voice model list after activate/upload/delete, keeping
  // the current selection if it still exists rather than resetting it.
  async function refreshVoiceModels(preferredId) {
    try {
      const res = await apiClient.getVoiceModels();
      const models = res.results;
      setVoiceModels(models);

      const stillExists = models.some((m) => m.id === (preferredId ?? selectedVoiceModelId));
      if (!stillExists) {
        const activeModel = models.find((m) => m.is_active);
        setSelectedVoiceModelId((activeModel ?? models[0])?.id ?? '');
      } else if (preferredId) {
        setSelectedVoiceModelId(preferredId);
      }
    } catch (err) {
      showToast(err?.detail ?? 'Failed to refresh voice models.', 'error');
    }
  }

  async function handleSelectVoice(model) {
    setSelectedVoiceModelId(model.id);
    if (model.is_active || !canManageVoices) return;

    setPendingActivateId(model.id);
    try {
      await apiClient.activateVoiceModel(model.id, role);
      await refreshVoiceModels(model.id);
      showToast(`${voiceModelLabel(model)} is now active.`, 'success');
    } catch (err) {
      showToast(err?.detail ?? 'Failed to activate voice.', 'error');
    } finally {
      setPendingActivateId(null);
    }
  }

  async function handleDeleteVoice(model) {
    if (model.is_active) return;
    const confirmed = window.confirm(`Delete "${voiceModelLabel(model)}"? This cannot be undone.`);
    if (!confirmed) return;

    setPendingDeleteId(model.id);
    try {
      await apiClient.deleteVoiceModel(model.id, role);
      await refreshVoiceModels();
      showToast('Voice profile deleted.', 'success');
    } catch (err) {
      showToast(err?.detail ?? 'Failed to delete voice.', 'error');
    } finally {
      setPendingDeleteId(null);
    }
  }

  async function handleUploadVoice(formData) {
    setIsUploading(true);
    setUploadErrors(null);
    try {
      const newModel = await apiClient.uploadVoiceModel(formData, role);
      await refreshVoiceModels(newModel?.id);
      setIsUploadModalOpen(false);
      showToast('Voice uploaded successfully.', 'success');
    } catch (err) {
      if (err?.error === 'validation_error') {
        setUploadErrors(err.detail);
      } else {
        setUploadErrors({ non_field: [err?.detail ?? 'Failed to upload voice.'] });
      }
      showToast(err?.detail ?? 'Failed to upload voice.', 'error');
    } finally {
      setIsUploading(false);
    }
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setSubmitErrors(null);
    setIsSubmitting(true);

    try {
      const result = await apiClient.generateVoice(text, selectedVoiceModelId);
      setJob(result);
    } catch (err) {
      // Section 15: error === "validation_error" → detail is { field: [messages] }
      if (err?.error === 'validation_error') {
        setSubmitErrors(err.detail);
      } else {
        setSubmitErrors({ non_field: [err?.detail ?? 'Failed to generate voice prompt.'] });
      }
      showToast('Failed to generate voice prompt.', 'error');
    } finally {
      setIsSubmitting(false);
    }
  }

  useEffect(() => {
    if (jobStatus === 'ready') {
      showToast('Voice prompt generated successfully.', 'success');
    } else if (jobStatus === 'failed') {
      showToast(jobResult?.error ?? 'Voice generation failed.', 'error');
    }
  }, [jobStatus]);

  const activeModel = voiceModels.find((m) => m.id === selectedVoiceModelId);

  return (
    <div className="generate-page">
      {playIntro && (
        <div className="generate-splash" aria-hidden="true">
          <span className="generate-splash-logo-mark">
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
          <span className="generate-splash-wordmark">VOICE</span>
        </div>
      )}

      <Navbar animateIn={playIntro} />

      <div className="generate-body">
        <VoiceProfileSidebar
          voiceModels={voiceModels}
          selectedVoiceModelId={selectedVoiceModelId}
          onSelect={handleSelectVoice}
          isLoading={isLoadingVoiceModels}
          error={voiceModelsError}
          canManage={canManageVoices}
          onUploadClick={() => setIsUploadModalOpen(true)}
          onDelete={handleDeleteVoice}
          pendingActivateId={pendingActivateId}
          pendingDeleteId={pendingDeleteId}
        />

        <div className={playIntro ? 'generate-hero generate-hero-intro' : 'generate-hero'}>
          <div className="generate-model-pill-row">
            <span className="generate-model-pill generate-model-pill-solid">
              {isLoadingVoiceModels
                ? 'Loading voice model…'
                : (activeModel ? voiceModelLabel(activeModel) : 'No voice model')}
            </span>
            <span className="generate-model-pill">Voice Generation ↗</span>
          </div>

          <h1 className="generate-title">
            Create Studio-Quality <span className="generate-title-accent">IVR Voice Prompts</span> in Seconds.
          </h1>
          <p className="generate-subtitle">
            Generate natural-sounding voice prompts for your IVR system in moments.
          </p>

          <div className="generate-card">
            <form onSubmit={handleSubmit} noValidate>
              <textarea
                id="generate-text"
                className={isOverLimit ? 'generate-textarea generate-textarea-error' : 'generate-textarea'}
                placeholder="Welcome to Acme Support. Turn your script into a natural-sounding voice prompt…"
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={5}
              />

              {submitErrors?.text && (
                <p className="generate-field-error" role="alert">
                  {submitErrors.text.join(' ')}
                </p>
              )}

              <div className="generate-card-footer">
                <div className="generate-chip-row">
                  <span className="generate-chip">{text.length} / {MAX_TEXT_LENGTH}</span>
                </div>

                <ShinyButton type="submit" className="generate-submit-shiny" disabled={!canSubmit}>
                  {isSubmitting && <span className="generate-spinner" aria-hidden="true" />}
                  {isSubmitting ? 'Generating…' : 'Generate'}
                </ShinyButton>
              </div>

              {submitErrors?.voice_model_id && (
                <p className="generate-field-error" role="alert">
                  {submitErrors.voice_model_id.join(' ')}
                </p>
              )}
              {submitErrors?.non_field && (
                <p className="generate-error" role="alert">
                  {submitErrors.non_field.join(' ')}
                </p>
              )}
            </form>

            {job && (
              <div className="generate-job-result">
                <div>
                  Job <strong>{job.job_id}</strong> — status: {jobStatus ?? job.status}
                </div>
                {jobStatus === 'processing' && !jobTimedOut && (
                  <div className="generate-job-status generate-job-status-processing">
                    <span className="generate-spinner generate-spinner-dark" aria-hidden="true" />
                    Generating audio…
                  </div>
                )}
                {jobTimedOut && (
                  <div className="generate-job-status generate-job-status-error" role="alert">
                    Generation is taking longer than expected. Try refreshing or contact your administrator.
                  </div>
                )}
                {jobPollError && (
                  <div className="generate-job-status generate-job-status-error" role="alert">
                    {jobPollError}
                  </div>
                )}
                {jobStatus === 'failed' && (
                  <div className="generate-job-status generate-job-status-error" role="alert">
                    {jobResult?.error ?? 'Generation failed.'}
                  </div>
                )}
                {jobStatus === 'ready' && jobResult?.audio_url && (
                  <AudioPlayer audioUrl={jobResult.audio_url} durationSeconds={jobResult.duration_seconds} />
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {isUploadModalOpen && (
        <UploadVoiceModal
          onClose={() => {
            setIsUploadModalOpen(false);
            setUploadErrors(null);
          }}
          onUpload={handleUploadVoice}
          isUploading={isUploading}
          errors={uploadErrors}
        />
      )}
    </div>
  );
}
