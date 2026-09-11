// frontend/src/pages/PromptLibrary.jsx
import { useEffect, useState } from 'react';
import { apiClient } from '../api/client';
import Navbar from '../components/Navbar';
import './PromptLibrary.css';

const MAX_PREVIEW_LENGTH = 140;

const STATUS_LABELS = {
  draft: 'Draft',
  processing: 'Processing',
  ready: 'Ready',
  approved: 'Approved',
  rejected: 'Rejected',
  failed: 'Failed',
  live: 'Live'
};

function truncate(text) {
  if (text.length <= MAX_PREVIEW_LENGTH) return text;
  return `${text.slice(0, MAX_PREVIEW_LENGTH).trimEnd()}…`;
}

function formatDate(isoString) {
  return new Date(isoString).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short'
  });
}

export default function PromptLibrary() {
  const [prompts, setPrompts] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;

    setIsLoading(true);
    setError(null);

    apiClient
      .getPrompts()
      .then((res) => {
        if (cancelled) return;
        setPrompts(res.results);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err?.detail ?? 'Failed to load prompts.');
      })
      .finally(() => {
        if (cancelled) return;
        setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="prompt-library-page">
      <Navbar />

      <div className="prompt-library-hero">
        <h1 className="prompt-library-title">Prompt Library</h1>
        <p className="prompt-library-subtitle">
          Browse every voice prompt that has been generated, reviewed, or published.
        </p>

        {isLoading && <div className="prompt-library-status">Loading prompts…</div>}

        {!isLoading && error && (
          <div className="prompt-library-status prompt-library-status-error" role="alert">
            {error}
          </div>
        )}

        {!isLoading && !error && prompts.length === 0 && (
          <div className="prompt-library-status">No prompts yet.</div>
        )}

        {!isLoading && !error && prompts.length > 0 && (
          <div className="prompt-library-grid">
            {prompts.map((prompt) => (
              <div key={prompt.id} className="prompt-card">
                <div className="prompt-card-header">
                  <span className={`prompt-status-badge prompt-status-${prompt.status}`}>
                    {STATUS_LABELS[prompt.status] ?? prompt.status}
                  </span>
                </div>
                <p className="prompt-card-text">{truncate(prompt.text)}</p>
                <div className="prompt-card-footer">
                  <span className="prompt-card-author">{prompt.created_by?.username}</span>
                  <span className="prompt-card-date">{formatDate(prompt.created_at)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
