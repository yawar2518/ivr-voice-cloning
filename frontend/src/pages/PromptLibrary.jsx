// frontend/src/pages/PromptLibrary.jsx
import { useEffect, useState } from 'react';
import { apiClient } from '../api/client';
import { useAuth } from '../context/AuthContext';
import Navbar from '../components/Navbar';
import '../components/ShinyButton.css';
import './PromptLibrary.css';

const MAX_PREVIEW_LENGTH = 140;
const SEARCH_DEBOUNCE_MS = 350;
const PAGE_SIZE = 12;

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
  const { role, userId, username, email } = useAuth();
  const currentUser = { id: userId, username, email, role };

  const [prompts, setPrompts] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  // Per-prompt UI state for the approve/reject/export actions, keyed by prompt id.
  const [actionErrors, setActionErrors] = useState({});
  const [pendingAction, setPendingAction] = useState(null); // `${promptId}:${action}` while in flight
  const [rejectingId, setRejectingId] = useState(null); // prompt id currently showing the reject-reason form
  const [rejectReason, setRejectReason] = useState('');

  const canApproveOrReject = role === 'approver' || role === 'admin';
  const canExport = role === 'admin';

  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);

  const [count, setCount] = useState(0);
  const [hasNext, setHasNext] = useState(false);
  const [hasPrevious, setHasPrevious] = useState(false);

  // Debounce the search box so we don't refetch on every keystroke.
  useEffect(() => {
    const timer = setTimeout(() => setSearch(searchInput.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [searchInput]);

  // Any filter change should return to page 1 rather than stay on a page
  // that may no longer exist for the new filter set.
  useEffect(() => {
    setPage(1);
  }, [search, statusFilter]);

  useEffect(() => {
    let cancelled = false;

    setIsLoading(true);
    setError(null);

    const params = { page, page_size: PAGE_SIZE };
    if (search) params.search = search;
    if (statusFilter) params.status = statusFilter;

    apiClient
      .getPrompts(params)
      .then((res) => {
        if (cancelled) return;
        setPrompts(res.results);
        setCount(res.count);
        setHasNext(Boolean(res.next));
        setHasPrevious(Boolean(res.previous));
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
  }, [search, statusFilter, page]);

  const totalPages = Math.max(1, Math.ceil(count / PAGE_SIZE));

  function patchPrompt(id, updates) {
    setPrompts((prev) => prev.map((p) => (p.id === id ? { ...p, ...updates } : p)));
  }

  function clearActionError(id) {
    setActionErrors((prev) => {
      if (!(id in prev)) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }

  async function handleApprove(prompt) {
    clearActionError(prompt.id);
    setPendingAction(`${prompt.id}:approve`);
    try {
      const res = await apiClient.approvePrompt(prompt.id, role, currentUser);
      patchPrompt(prompt.id, res);
    } catch (err) {
      setActionErrors((prev) => ({ ...prev, [prompt.id]: err?.detail ?? 'Failed to approve prompt.' }));
    } finally {
      setPendingAction(null);
    }
  }

  function startReject(prompt) {
    clearActionError(prompt.id);
    setRejectingId(prompt.id);
    setRejectReason('');
  }

  function cancelReject() {
    setRejectingId(null);
    setRejectReason('');
  }

  async function handleReject(prompt) {
    clearActionError(prompt.id);
    setPendingAction(`${prompt.id}:reject`);
    try {
      const res = await apiClient.rejectPrompt(prompt.id, rejectReason, role, currentUser);
      patchPrompt(prompt.id, res);
      setRejectingId(null);
      setRejectReason('');
    } catch (err) {
      const detail = typeof err?.detail === 'string' ? err.detail : err?.detail?.reason?.join(' ');
      setActionErrors((prev) => ({ ...prev, [prompt.id]: detail ?? 'Failed to reject prompt.' }));
    } finally {
      setPendingAction(null);
    }
  }

  async function handleExport(prompt) {
    clearActionError(prompt.id);
    setPendingAction(`${prompt.id}:export`);
    try {
      const res = await apiClient.exportPrompt(prompt.id, role, currentUser);
      patchPrompt(prompt.id, res);
    } catch (err) {
      setActionErrors((prev) => ({ ...prev, [prompt.id]: err?.detail ?? 'Failed to export prompt.' }));
    } finally {
      setPendingAction(null);
    }
  }

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
          <div className="shiny-select-wrap">
            <select
              className="prompt-library-status-select shiny-select"
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
          <>
            <div className="prompt-library-grid">
              {prompts.map((prompt) => {
                const isApproving = pendingAction === `${prompt.id}:approve`;
                const isRejecting = pendingAction === `${prompt.id}:reject`;
                const isExporting = pendingAction === `${prompt.id}:export`;
                const isBusy = pendingAction?.startsWith(`${prompt.id}:`);

                const showApproveReject = canApproveOrReject && prompt.status === 'ready';
                const showExport = canExport && prompt.status === 'approved';

                return (
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

                    {actionErrors[prompt.id] && (
                      <p className="prompt-card-error" role="alert">
                        {actionErrors[prompt.id]}
                      </p>
                    )}

                    {rejectingId === prompt.id ? (
                      <div className="prompt-card-reject-form">
                        <textarea
                          className="prompt-card-reject-textarea"
                          placeholder="Reason for rejection…"
                          value={rejectReason}
                          onChange={(e) => setRejectReason(e.target.value)}
                          rows={2}
                          autoFocus
                        />
                        <div className="prompt-card-actions">
                          <button
                            type="button"
                            className="prompt-card-btn prompt-card-btn-ghost"
                            onClick={cancelReject}
                            disabled={isRejecting}
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            className="prompt-card-btn prompt-card-btn-danger"
                            onClick={() => handleReject(prompt)}
                            disabled={isRejecting || rejectReason.trim() === ''}
                          >
                            {isRejecting ? 'Rejecting…' : 'Confirm reject'}
                          </button>
                        </div>
                      </div>
                    ) : (
                      (showApproveReject || showExport) && (
                        <div className="prompt-card-actions">
                          {showApproveReject && (
                            <>
                              <button
                                type="button"
                                className="prompt-card-btn prompt-card-btn-primary"
                                onClick={() => handleApprove(prompt)}
                                disabled={isBusy}
                              >
                                {isApproving ? 'Approving…' : 'Approve'}
                              </button>
                              <button
                                type="button"
                                className="prompt-card-btn prompt-card-btn-danger"
                                onClick={() => startReject(prompt)}
                                disabled={isBusy}
                              >
                                Reject
                              </button>
                            </>
                          )}
                          {showExport && (
                            <button
                              type="button"
                              className="prompt-card-btn prompt-card-btn-primary"
                              onClick={() => handleExport(prompt)}
                              disabled={isBusy}
                            >
                              {isExporting ? 'Exporting…' : 'Export'}
                            </button>
                          )}
                        </div>
                      )
                    )}
                  </div>
                );
              })}
            </div>

            <div className="prompt-library-pagination">
              <button
                type="button"
                className="prompt-library-page-btn"
                onClick={() => setPage((p) => p - 1)}
                disabled={!hasPrevious}
              >
                Previous
              </button>
              <span className="prompt-library-page-indicator">
                Page {page} of {totalPages} · {count} prompt{count === 1 ? '' : 's'}
              </span>
              <button
                type="button"
                className="prompt-library-page-btn"
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
