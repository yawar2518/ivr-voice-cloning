// frontend/src/components/CommandPalette.jsx
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AudioLines, CornerDownLeft, Mic, Search, Sparkles } from 'lucide-react';
import { apiClient } from '../api/client';
import { useUI } from '../context/UIContext';
import { initials, truncate } from '../utils/format';
import './CommandPalette.css';

export default function CommandPalette() {
  const navigate = useNavigate();
  const { closePalette, openUploadVoice, openPlayer } = useUI();
  const [query, setQuery] = useState('');
  const [recents, setRecents] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef(null);
  const listRef = useRef(null);

  useEffect(() => {
    inputRef.current?.focus();
    let cancelled = false;
    apiClient
      .getGenerations({ page_size: 5 })
      .then((res) => {
        if (!cancelled) setRecents(res.results ?? []);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const actions = useMemo(
    () => [
      {
        id: 'create-voice',
        icon: Mic,
        title: 'Create a voice',
        subtitle: 'Voice Design · Instant clone',
        keywords: 'create voice clone upload add',
        run: () => {
          closePalette();
          navigate('/voices');
          openUploadVoice();
        }
      },
      {
        id: 'generate-speech',
        icon: AudioLines,
        title: 'Generate speech',
        subtitle: 'Text to Speech',
        keywords: 'generate speech text tts',
        run: () => {
          closePalette();
          navigate('/tts');
        }
      },
      {
        id: 'library',
        icon: Sparkles,
        title: 'Open Library',
        subtitle: 'Your generation history',
        keywords: 'library history recents',
        run: () => {
          closePalette();
          navigate('/library');
        }
      }
    ],
    [closePalette, navigate, openUploadVoice]
  );

  const q = query.trim().toLowerCase();
  const filteredActions = actions.filter(
    (a) => !q || a.title.toLowerCase().includes(q) || a.keywords.includes(q)
  );
  const filteredRecents = recents.filter((g) => !q || g.text.toLowerCase().includes(q));

  const items = [
    ...filteredActions.map((a) => ({ type: 'action', key: a.id, run: a.run, data: a })),
    ...filteredRecents.map((g) => ({
      type: 'recent',
      key: g.id,
      run: () => {
        closePalette();
        openPlayer(g);
      },
      data: g
    }))
  ];

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-index="${activeIndex}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex]);

  function onKeyDown(event) {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((i) => Math.min(items.length - 1, i + 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((i) => Math.max(0, i - 1));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      items[activeIndex]?.run();
    } else if (event.key === 'Escape') {
      closePalette();
    }
  }

  let runningIndex = -1;

  return (
    <div
      className="overlay overlay-top"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) closePalette();
      }}
      role="presentation"
    >
      <div className="palette" role="dialog" aria-modal="true" aria-label="Command palette" data-testid="command-palette">
        <div className="palette-search">
          <Search size={18} strokeWidth={2} aria-hidden="true" />
          <input
            ref={inputRef}
            type="text"
            placeholder="Search actions, voices, music, assets..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            aria-label="Search"
          />
          <kbd className="palette-esc">esc</kbd>
        </div>

        <div className="palette-list" ref={listRef}>
          {filteredActions.length > 0 && (
            <div className="palette-section">
              <div className="palette-section-title">Quick actions</div>
              {filteredActions.map((action) => {
                runningIndex += 1;
                const index = runningIndex;
                const Icon = action.icon;
                return (
                  <button
                    key={action.id}
                    type="button"
                    data-index={index}
                    className={index === activeIndex ? 'palette-item palette-item-active' : 'palette-item'}
                    onMouseEnter={() => setActiveIndex(index)}
                    onClick={action.run}
                  >
                    <span className="palette-item-icon">
                      <Icon size={18} strokeWidth={1.8} />
                    </span>
                    <span className="palette-item-copy">
                      <span className="palette-item-title">{action.title}</span>
                      <span className="palette-item-subtitle">{action.subtitle}</span>
                    </span>
                    {index === activeIndex && (
                      <span className="palette-item-hint">
                        Open <CornerDownLeft size={12} />
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}

          <div className="palette-section">
            <div className="palette-section-title">Recent</div>
            {isLoading && <div className="palette-empty">Loading recent generations…</div>}
            {!isLoading && filteredRecents.length === 0 && (
              <div className="palette-empty">{q ? 'No matches.' : 'No generations yet.'}</div>
            )}
            {filteredRecents.map((generation) => {
              runningIndex += 1;
              const index = runningIndex;
              const voiceName = generation.voice_model?.display_name ?? 'Voice';
              return (
                <button
                  key={generation.id}
                  type="button"
                  data-index={index}
                  className={index === activeIndex ? 'palette-item palette-item-active' : 'palette-item'}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => {
                    closePalette();
                    openPlayer(generation);
                  }}
                >
                  <span className="avatar palette-item-avatar">{initials(voiceName)}</span>
                  <span className="palette-item-copy">
                    <span className="palette-item-title">{truncate(generation.text, 72)}</span>
                    <span className="palette-item-subtitle">Text to Speech · {voiceName}</span>
                  </span>
                  {index === activeIndex && (
                    <span className="palette-item-hint">
                      Open <CornerDownLeft size={12} />
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
