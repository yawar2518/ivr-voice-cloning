// frontend/src/pages/AuditLog.jsx
import { useEffect, useState } from 'react';
import { apiClient } from '../api/client';
import Navbar from '../components/Navbar';
import CustomDropdown from '../components/CustomDropdown';
import { AuditRowSkeleton } from '../components/Skeleton';
import '../components/ShinyButton.css';
import './AuditLog.css';

const PAGE_SIZE = 15;
const SKELETON_COUNT = 4;

const ACTION_LABELS = {
  approve: 'Approved',
  reject: 'Rejected',
  export: 'Exported'
};

const ACTION_OPTIONS = Object.keys(ACTION_LABELS);

function formatDate(isoString) {
  return new Date(isoString).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short'
  });
}

// Section 11 gives us the prompt's UUID, not its text — show a short,
// readable reference rather than the full id.
function shortPromptRef(promptId) {
  return promptId ? promptId.slice(0, 8) : promptId;
}

export default function AuditLog() {
  const [entries, setEntries] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  const [actionFilter, setActionFilter] = useState('');
  const [page, setPage] = useState(1);

  const [count, setCount] = useState(0);
  const [hasNext, setHasNext] = useState(false);
  const [hasPrevious, setHasPrevious] = useState(false);

  useEffect(() => {
    setPage(1);
  }, [actionFilter]);

  useEffect(() => {
    let cancelled = false;

    setIsLoading(true);
    setError(null);

    const params = { page, page_size: PAGE_SIZE };
    if (actionFilter) params.action = actionFilter;

    apiClient
      .getAuditLog(params)
      .then((res) => {
        if (cancelled) return;
        setEntries(res.results);
        setCount(res.count);
        setHasNext(Boolean(res.next));
        setHasPrevious(Boolean(res.previous));
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err?.detail ?? 'Failed to load audit log.');
      })
      .finally(() => {
        if (cancelled) return;
        setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [actionFilter, page]);

  const totalPages = Math.max(1, Math.ceil(count / PAGE_SIZE));

  return (
    <div className="audit-log-page">
      <Navbar />

      <div className="audit-log-hero">
        <h1 className="audit-log-title">Audit Log</h1>
        <p className="audit-log-subtitle">
          A record of every approve, reject, and export action taken on voice prompts.
        </p>

        <div className="audit-log-filters">
          <CustomDropdown
            options={ACTION_OPTIONS.map((action) => ({ value: action, label: ACTION_LABELS[action] }))}
            value={actionFilter}
            onChange={setActionFilter}
            placeholder="All actions"
          />
        </div>

        {isLoading && (
          <div className="audit-log-list">
            {Array.from({ length: SKELETON_COUNT }, (_, i) => (
              <AuditRowSkeleton key={i} />
            ))}
          </div>
        )}

        {!isLoading && error && (
          <div className="audit-log-status audit-log-status-error" role="alert">
            {error}
          </div>
        )}

        {!isLoading && !error && entries.length === 0 && (
          <div className="audit-log-status">
            {actionFilter ? 'No entries match this filter.' : 'No audit entries yet.'}
          </div>
        )}

        {!isLoading && !error && entries.length > 0 && (
          <>
            <div className="audit-log-list">
              {entries.map((entry) => (
                <div key={entry.id} className="audit-log-entry">
                  <span className={`audit-log-action-badge audit-log-action-${entry.action}`}>
                    {ACTION_LABELS[entry.action] ?? entry.action}
                  </span>
                  <div className="audit-log-entry-body">
                    <p className="audit-log-entry-text">
                      <strong>{entry.performed_by?.username}</strong>{' '}
                      {(ACTION_LABELS[entry.action] ?? entry.action).toLowerCase()}{' '}
                      <span className="audit-log-entry-prompt">Prompt: {shortPromptRef(entry.prompt_id)}</span>
                    </p>
                    {(entry.before_status || entry.after_status) && (
                      <p className="audit-log-entry-transition">
                        {entry.before_status ?? '—'} → {entry.after_status ?? '—'}
                      </p>
                    )}
                    {entry.detail?.reason && (
                      <p className="audit-log-entry-reason">Reason: {entry.detail.reason}</p>
                    )}
                  </div>
                  <span className="audit-log-entry-date">{formatDate(entry.timestamp)}</span>
                </div>
              ))}
            </div>

            <div className="audit-log-pagination">
              <button
                type="button"
                className="audit-log-page-btn"
                onClick={() => setPage((p) => p - 1)}
                disabled={!hasPrevious}
              >
                Previous
              </button>
              <span className="audit-log-page-indicator">
                Page {page} of {totalPages} · {count} entr{count === 1 ? 'y' : 'ies'}
              </span>
              <button
                type="button"
                className="audit-log-page-btn"
                onClick={() => setPage((p) => p + 1)}
                disabled={!hasNext}
              >
                Next
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
