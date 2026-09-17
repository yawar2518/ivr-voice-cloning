// frontend/src/pages/Library.jsx
import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Library as LibraryIcon, Search } from 'lucide-react';
import { apiClient } from '../api/client';
import { useUI } from '../context/UIContext';
import GenerationCard from '../components/GenerationCard';
import { GenerationCardSkeleton } from '../components/Skeleton';
import { formatNumber } from '../utils/format';
import './Library.css';

const PAGE_SIZE = 16;
const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'tts', label: 'Text to Speech' }
];

export default function Library() {
  const { openPlayer, generationsVersion } = useUI();
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState({ count: 0, results: [] });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const id = setTimeout(() => setDebounced(search.trim()), 250);
    return () => clearTimeout(id);
  }, [search]);

  useEffect(() => {
    setPage(1);
  }, [debounced, filter]);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError(null);
    apiClient
      .getGenerations({ page, page_size: PAGE_SIZE, search: debounced || undefined })
      .then((res) => {
        if (!cancelled) setData(res);
      })
      .catch((err) => {
        if (!cancelled) setError(err?.detail ?? 'Failed to load your library.');
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [page, debounced, generationsVersion]);

  const totalPages = Math.max(1, Math.ceil(data.count / PAGE_SIZE));

  return (
    <div className="library">
      <div className="page-header">
        <div className="page-header-copy">
          <h1 className="page-title">Library</h1>
          <p className="page-subtitle">
            {isLoading ? 'Loading…' : `${formatNumber(data.count)} generation${data.count === 1 ? '' : 's'}`}
          </p>
        </div>
      </div>

      <div className="library-toolbar">
        <div className="library-tabs" role="tablist">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              role="tab"
              aria-selected={filter === f.id}
              className={filter === f.id ? 'library-tab library-tab-active' : 'library-tab'}
              onClick={() => setFilter(f.id)}
            >
              {f.label}
            </button>
          ))}
        </div>
        <label className="library-search">
          <Search size={15} aria-hidden="true" />
          <input
            type="search"
            placeholder="Search your generations"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search generations"
          />
        </label>
      </div>

      {error && (
        <div className="gen-error" role="alert">
          {error}
        </div>
      )}

      {isLoading ? (
        <div className="gen-grid">
          {Array.from({ length: 8 }).map((_, i) => (
            <GenerationCardSkeleton key={i} />
          ))}
        </div>
      ) : data.results.length === 0 ? (
        <div className="empty">
          <span className="empty-icon">
            <LibraryIcon size={20} />
          </span>
          <p className="empty-title">{debounced ? 'No matches' : 'Your library is empty'}</p>
          <p className="empty-text">
            {debounced ? 'Try a different search term.' : 'Everything you generate lands here, ready to replay or download.'}
          </p>
        </div>
      ) : (
        <div className="gen-grid">
          {data.results.map((generation) => (
            <GenerationCard key={generation.id} generation={generation} onClick={openPlayer} />
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <div className="library-pagination">
          <button type="button" className="btn btn-secondary btn-sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            <ChevronLeft size={14} /> Previous
          </button>
          <span className="library-page-indicator">
            Page {page} of {totalPages}
          </span>
          <button type="button" className="btn btn-secondary btn-sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
            Next <ChevronRight size={14} />
          </button>
        </div>
      )}
    </div>
  );
}
