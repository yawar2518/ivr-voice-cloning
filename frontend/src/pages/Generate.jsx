// frontend/src/pages/Generate.jsx
import { useEffect, useState } from 'react';
import { apiClient } from '../api/client';
import { useGenerateJob } from '../hooks/useGenerateJob';
import AudioPlayer from '../components/AudioPlayer';
import './Generate.css';

const MAX_TEXT_LENGTH = 500; // contract Section 15

function voiceModelLabel(model) {
  return `${model.provider} — ${model.model_variant} (${model.version_label})`;
}

export default function Generate() {
  const [text, setText] = useState('');

  const [voiceModels, setVoiceModels] = useState([]);
  const [selectedVoiceModelId, setSelectedVoiceModelId] = useState('');
  const [isLoadingVoiceModels, setIsLoadingVoiceModels] = useState(true);
  const [voiceModelsError, setVoiceModelsError] = useState(null);

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
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="generate-page">
      <div className="generate-card">
        <h1 className="generate-title">Generate Voice Prompt</h1>

        <form onSubmit={handleSubmit} noValidate>
          <div className="generate-field">
            <label htmlFor="generate-text">Prompt text</label>
            <textarea
              id="generate-text"
              className={isOverLimit ? 'generate-textarea generate-textarea-error' : 'generate-textarea'}
              placeholder="Enter the text to generate as a voice prompt..."
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={6}
            />
            <div className={isOverLimit ? 'generate-char-count generate-char-count-error' : 'generate-char-count'}>
              {text.length} / {MAX_TEXT_LENGTH}
            </div>
            {submitErrors?.text && (
              <p className="generate-field-error" role="alert">
                {submitErrors.text.join(' ')}
              </p>
            )}
          </div>

          <div className="generate-field">
            <label htmlFor="generate-voice-model">Voice model</label>
            <select
              id="generate-voice-model"
              className="generate-select"
              value={selectedVoiceModelId}
              onChange={(e) => setSelectedVoiceModelId(e.target.value)}
              disabled={isLoadingVoiceModels || voiceModels.length === 0}
            >
              {isLoadingVoiceModels && <option value="">Loading voice models…</option>}
              {!isLoadingVoiceModels && voiceModels.length === 0 && !voiceModelsError && (
                <option value="">No voice models available</option>
              )}
              {voiceModels.map((model) => (
                <option key={model.id} value={model.id}>
                  {voiceModelLabel(model)}
                  {model.is_active ? ' (active)' : ''}
                </option>
              ))}
            </select>
            {voiceModelsError && (
              <p className="generate-field-error" role="alert">
                {voiceModelsError}
              </p>
            )}
            {submitErrors?.voice_model_id && (
              <p className="generate-field-error" role="alert">
                {submitErrors.voice_model_id.join(' ')}
              </p>
            )}
          </div>

          {submitErrors?.non_field && (
            <p className="generate-error" role="alert">
              {submitErrors.non_field.join(' ')}
            </p>
          )}

          <button type="submit" className="generate-submit" disabled={!canSubmit}>
            {isSubmitting && <span className="generate-spinner" aria-hidden="true" />}
            {isSubmitting ? 'Generating…' : 'Generate'}
          </button>
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
                This is taking longer than expected. Please check back later.
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
  );
}
