// frontend/src/pages/PromptLibrary.jsx
import { useEffect, useState } from 'react';
import { apiClient } from '../api/client';
import Navbar from '../components/Navbar';
import './PromptLibrary.css';

const MAX_PREVIEW_LENGTH = 140;
const SEARCH_DEBOUNCE_MS = 350;

const STATUS_LABELS = {
  draft: 'Draft',
  processing: 'Processing',
  ready: 'Ready',
  approved: 'Approved',
  rejected: 'Rejected',
  failed: 'Failed',
  live: 'Live'
};

const STATUS_OPTIONS = Object.keys(STATUS_LABELS);

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

  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  // Debounce the search box so we don't refetch on every keystroke.
  useEffect(() => {
    const timer = setTimeout(() => setSearch(searchInput.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    let cancelled = false;

    setIsLoading(true);
    setError(null);

    const params = {};
    if (search) params.search = search;
    if (statusFilter) params.status = statusFilter;

    apiClient
      .getPrompts(params)
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
  }, [search, statusFilter]);

  return (
    <div className="prompt-library-page">
      <Navbar />

      <div className="prompt-library-hero">
        <h1 className="prompt-library-title">Prompt Library</h1>
        <p className="prompt-library-subtitle">
          Browse every voice prompt that has been generated, reviewed, or published.
        </p>

        <div className="prompt-library-filters">
          <input
            type="text"
            className="prompt-library-search"
            placeholder="Search prompt text…"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
          />
          <select
            className="prompt-library-status-select"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="">All statuses</option>
            {STATUS_OPTIONS.map((status) => (
              <option key={status} value={status}>
                {STATUS_LABELS[status]}
              </option>
            ))}
          </select>
        </div>

        {isLoading && <div className="prompt-library-status">Loading prompts…</div>}

        {!isLoading && error && (
          <div className="prompt-library-status prompt-library-status-error" role="alert">
            {error}
          </div>
        )}

        {!isLoading && !error && prompts.length === 0 && (
          <div className="prompt-library-status">
            {search || statusFilter ? 'No prompts match your filters.' : 'No prompts yet.'}
          </div>
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
