// frontend/src/pages/Home.jsx
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, ArrowUp, Check, ChevronDown, Download, Ellipsis, Image, Mic, Music, SlidersHorizontal, Sparkles, Video, Volume2, Waves, X } from 'lucide-react';
import { apiClient } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useUI } from '../context/UIContext';
import { useToast } from '../context/ToastContext';
import { useVoices, voiceLabel } from '../context/VoicesContext';
import { useGenerateJob } from '../hooks/useGenerateJob';
import AudioPlayer from '../components/AudioPlayer';
import GenerationCard from '../components/GenerationCard';
import { GenerationCardSkeleton } from '../components/Skeleton';
import { useDownload } from '../components/PlayerModal';
import { formatNumber, gradientFor, initials, languageLabel } from '../utils/format';
import './Home.css';

const MAX_TEXT_LENGTH = 5000;
const EMOTION_TAG_RE = /\[[^[\]\n]{1,40}\]/g;
const RECENTS_LIMIT = 8;
const BANNER_KEY = 'voiceclone.banner.dismissed';

const TABS = [
  { id: 'speech', label: 'Speech', icon: Waves, enabled: true },
  { id: 'image', label: 'Image', icon: Image },
  { id: 'video', label: 'Video', icon: Video },
  { id: 'sfx', label: 'Sound Effects', icon: Sparkles },
  { id: 'music', label: 'Music', icon: Music },
  { id: 'changer', label: 'Voice Changer', icon: SlidersHorizontal },
  { id: 'isolator', label: 'Voice Isolator', icon: Volume2 },
  { id: 'more', label: 'More tools', icon: Ellipsis, more: true }
];

const CHIPS = [
  {
    label: 'Discover your voice',
    text: 'Hi there. This is what I sound like when I read a script in a calm, confident tone. Every word is generated from a short sample of my voice.'
  },
  {
    label: 'Laugh uncontrollably',
    text: "Okay, okay, wait, you have to hear this one. Ha ha ha! I can't even get through it without cracking up. Alright, alright, I'm done. Ha!"
  },
  {
    label: 'Whisper a secret',
    text: "Come closer. I shouldn't be telling you this, but... the launch is happening tomorrow, at noon. Don't tell anyone I said so."
  },
  {
    label: 'Tell a dramatic monologue',
    text: 'They said it could not be done. They said the sea would swallow us whole. And yet, here we stand, at the edge of everything we ever wanted.'
  }
];

function Banner() {
  const navigate = useNavigate();
  const { openUploadVoice } = useUI();
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem(BANNER_KEY) === '1';
    } catch {
      return false;
    }
  });

  if (dismissed) return null;

  function dismiss() {
    setDismissed(true);
    try {
      localStorage.setItem(BANNER_KEY, '1');
    } catch {
      // ignore
    }
  }

  return (
    <section className="banner" aria-label="Announcement">
      <div className="banner-art" aria-hidden="true" />
      <button type="button" className="banner-close" onClick={dismiss} aria-label="Dismiss announcement">
        <X size={16} />
      </button>
      <div className="banner-copy">
        <h2 className="banner-title">Voice Cloning is here. Clone any voice in seconds.</h2>
        <p className="banner-subtitle">Upload a 30-second sample and generate speech in that voice.</p>
        <div className="banner-actions">
          <button
            type="button"
            className="btn banner-btn-primary"
            onClick={() => {
              navigate('/voices');
              openUploadVoice();
            }}
          >
            Try Voice Cloning
          </button>
          <Link to="/voices" className="btn banner-btn-ghost">
            Learn more
          </Link>
        </div>
      </div>
    </section>
  );
}

function VoicePicker({ voices, selectedVoice, onSelect, disabled }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (!open) return undefined;
    function onClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    function onKey(e) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const defaults = voices.filter((v) => v.is_default);
  const custom = voices.filter((v) => !v.is_default);

  function renderOption(voice) {
    const isSelected = voice.id === selectedVoice?.id;
    const ready = voice.status === 'ready';
    return (
      <button
        key={voice.id}
        type="button"
        className={`voice-option ${isSelected ? 'voice-option-selected' : ''}`}
        disabled={!ready}
        onClick={() => {
          onSelect(voice);
          setOpen(false);
        }}
        role="option"
        aria-selected={isSelected}
      >
        <span className="avatar avatar-sm" style={{ background: `linear-gradient(135deg, ${gradientFor(voice.id).from}, ${gradientFor(voice.id).to})` }}>
          {initials(voice.display_name)}
        </span>
        <span className="voice-option-copy">
          <span className="voice-option-name">{voiceLabel(voice)}</span>
          <span className="voice-option-sub">
            {languageLabel(voice.language)}
            {!ready && ` · ${voice.status}`}
          </span>
        </span>
        {isSelected && <Check size={15} className="voice-option-check" />}
      </button>
    );
  }

  return (
    <div className="voice-picker" ref={ref}>
      <button
        type="button"
        className="voice-picker-trigger"
        onClick={() => setOpen((v) => !v)}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        data-testid="voice-picker"
      >
        {selectedVoice ? (
          <>
            <span
              className="avatar avatar-sm"
              style={{
                background: `linear-gradient(135deg, ${gradientFor(selectedVoice.id).from}, ${gradientFor(selectedVoice.id).to})`
              }}
            >
              {initials(selectedVoice.display_name)}
            </span>
            <span className="voice-picker-name">{voiceLabel(selectedVoice)}</span>
          </>
        ) : (
          <span className="voice-picker-name t-secondary">Choose a voice</span>
        )}
        <ChevronDown size={14} className="voice-picker-chevron" />
      </button>

      {open && (
        <div className="menu voice-picker-menu" role="listbox">
          {custom.length > 0 && (
            <>
              <div className="voice-picker-label">My voices</div>
              {custom.map(renderOption)}
              <div className="menu-separator" />
            </>
          )}
          <div className="voice-picker-label">Default voices</div>
          {defaults.map(renderOption)}
          <div className="menu-separator" />
          <button
            type="button"
            className="menu-item"
            onClick={() => {
              setOpen(false);
              navigate('/voices');
            }}
          >
            <Mic size={15} />
            Manage voices
          </button>
        </div>
      )}
    </div>
  );
}

export default function Home({ focusEditor = false }) {
  const { user, refreshProfile, applyCreditCharge } = useAuth();
  const { voices, selectedVoice, setSelectedVoiceId, isLoading: voicesLoading } = useVoices();
  const { openPlayer, generationsVersion, bumpGenerations } = useUI();
  const { showToast } = useToast();
  const { download, downloading } = useDownload();

  const [text, setText] = useState('');
  const [activeTab, setActiveTab] = useState('speech');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const [job, setJob] = useState(null);
  const [completed, setCompleted] = useState(null);
  const [recents, setRecents] = useState([]);
  const [recentsLoading, setRecentsLoading] = useState(true);
  const textareaRef = useRef(null);

  const { status: jobStatus, result: jobResult, error: jobError, timedOut } = useGenerateJob(job?.job_id ?? null);

  const remaining = user?.credits_remaining ?? 0;
  const trimmedLength = text.length;
  const hasEmotionTags = EMOTION_TAG_RE.test(text);
  EMOTION_TAG_RE.lastIndex = 0;
  const overLimit = trimmedLength > MAX_TEXT_LENGTH;
  const overBudget = trimmedLength > remaining;
  const isGenerating = isSubmitting || jobStatus === 'processing';
  const canGenerate = text.trim() !== '' && !overLimit && !overBudget && selectedVoice?.status === 'ready' && !isGenerating;

  useEffect(() => {
    if (focusEditor) textareaRef.current?.focus();
  }, [focusEditor]);

  // Recents
  useEffect(() => {
    let cancelled = false;
    setRecentsLoading(true);
    apiClient
      .getGenerations({ page_size: RECENTS_LIMIT })
      .then((res) => {
        if (!cancelled) setRecents(res.results ?? []);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setRecentsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [generationsVersion]);

  // Job lifecycle → completed generation
  useEffect(() => {
    if (!job) return;
    if (jobStatus === 'ready') {
      apiClient
        .getGeneration(job.prompt_id)
        .then((fresh) => {
          setCompleted(fresh);
          bumpGenerations();
        })
        .catch(() => {
          setCompleted({
            id: job.prompt_id,
            text,
            audio_url: jobResult?.audio_url,
            duration_seconds: jobResult?.duration_seconds,
            credits_used: job.credits_charged,
            status: 'ready'
          });
          bumpGenerations();
        });
      refreshProfile();
      showToast('Speech generated.', 'success');
    } else if (jobStatus === 'failed') {
      showToast(jobResult?.error ?? 'Generation failed.', 'error');
      refreshProfile();
      bumpGenerations();
    }
  }, [jobStatus]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleGenerate(event) {
    event?.preventDefault();
    if (!canGenerate) return;
    setSubmitError(null);
    setIsSubmitting(true);
    setCompleted(null);
    try {
      const result = await apiClient.generateVoice(text, selectedVoice.id);
      applyCreditCharge(result.credits_charged ?? text.length);
      setJob(result);
    } catch (err) {
      if (err?.error === 'insufficient_credits') {
        setSubmitError('Not enough credits for this script. Upgrade your plan or shorten the text.');
        refreshProfile();
      } else {
        setSubmitError(err?.detail ?? 'Failed to generate speech.');
      }
      showToast(err?.detail ?? 'Failed to generate speech.', 'error');
    } finally {
      setIsSubmitting(false);
    }
  }

  function onKeyDown(event) {
    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
      event.preventDefault();
      handleGenerate();
    }
  }

  const completedGradient = completed ? gradientFor(completed.id) : null;

  return (
    <div className="home">
      <section className="gen-panel card" aria-label="Generate speech">
        <div className="gen-tabs" role="tablist">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={isActive}
                className={`gen-tab ${isActive ? 'gen-tab-active' : ''} ${tab.enabled || tab.more ? '' : 'gen-tab-disabled'}`}
                onClick={() => {
                  if (tab.enabled) setActiveTab(tab.id);
                  else showToast(`${tab.label} is coming soon.`, 'info');
                }}
                title={tab.enabled || tab.more ? undefined : 'Coming soon'}
              >
                <Icon size={15} strokeWidth={1.9} />
                {tab.label}
              </button>
            );
          })}
        </div>

        <form onSubmit={handleGenerate} noValidate>
          <div className="gen-editor">
            <textarea
              ref={textareaRef}
              className="gen-textarea"
              placeholder="Type or paste your script. Use punctuation, commas and ellipses to shape the delivery..."
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={onKeyDown}
              maxLength={MAX_TEXT_LENGTH + 500}
              aria-label="Text to generate"
              data-testid="generate-textarea"
            />
            <span className={`gen-counter ${overLimit || overBudget ? 'gen-counter-error' : ''}`} data-testid="char-counter">
              {formatNumber(trimmedLength)} / {formatNumber(MAX_TEXT_LENGTH)}
            </span>
          </div>

          <div className="gen-chips" role="list">
            {CHIPS.map((chip) => (
              <button
                key={chip.label}
                type="button"
                className="gen-chip"
                onClick={() => {
                  setText(chip.text);
                  textareaRef.current?.focus();
                }}
                role="listitem"
              >
                {chip.label}
              </button>
            ))}
          </div>

          <div className="gen-footer">
            <div className="gen-footer-left">
              <span className="pill pill-dark gen-model">
                <Waves size={12} /> VoiceClone v1
              </span>
              <VoicePicker
                voices={voices}
                selectedVoice={selectedVoice}
                onSelect={(voice) => setSelectedVoiceId(voice.id)}
                disabled={voicesLoading || voices.length === 0}
              />
              <Link to="/voices" className="gen-more-options">
                More options <ArrowRight size={13} />
              </Link>
            </div>
            <button type="submit" className="btn btn-primary gen-submit" disabled={!canGenerate} data-testid="generate-button">
              {isGenerating ? <span className="spinner" aria-hidden="true" /> : <ArrowUp size={16} strokeWidth={2.4} />}
              {isSubmitting ? 'Sending…' : jobStatus === 'processing' ? 'Generating…' : 'Generate'}
            </button>
          </div>

          {hasEmotionTags && (
            <p className="gen-notice" role="status" data-testid="tag-notice">
              Emotion tags like [laughs] or [whispers] are not supported by VoiceClone v1 yet. They are skipped before
              synthesis and not billed.
            </p>
          )}

          {(submitError || overBudget) && (
            <p className="gen-error" role="alert" data-testid="generate-error">
              {submitError ??
                `This script needs ${formatNumber(trimmedLength)} credits but you have ${formatNumber(remaining)} left. Upgrade your plan or shorten the text.`}
            </p>
          )}
          {overLimit && !overBudget && (
            <p className="gen-error" role="alert">
              Scripts are limited to {formatNumber(MAX_TEXT_LENGTH)} characters.
            </p>
          )}
        </form>

        {job && jobStatus === 'processing' && !timedOut && (
          <div className="gen-result gen-result-processing" aria-live="polite">
            <span className="spinner spinner-dark" aria-hidden="true" />
            <div>
              <div className="gen-result-title">Generating with {voiceLabel(selectedVoice)}…</div>
              <div className="gen-result-sub">Usually takes a few seconds. Charged {formatNumber(job.credits_charged)} credits.</div>
            </div>
          </div>
        )}
        {(timedOut || jobError || jobStatus === 'failed') && (
          <div className="gen-result gen-result-error" role="alert">
            {timedOut
              ? 'This is taking longer than expected. Check the Library in a moment.'
              : jobError ?? jobResult?.error ?? 'Generation failed.'}
          </div>
        )}

        {completed && completed.audio_url && (
          <div className="gen-result gen-result-ready" data-testid="generation-result">
            <AudioPlayer audioUrl={completed.audio_url} durationSeconds={completed.duration_seconds} accent={completedGradient.from} autoPlay />
            <div className="gen-result-row">
              <span className="gen-result-credits">Used {formatNumber(completed.credits_used ?? job?.credits_charged ?? 0)} credits</span>
              <div className="gen-result-actions">
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => download(completed.id, 'mp3')} disabled={downloading !== null}>
                  {downloading === 'mp3' ? <span className="spinner spinner-dark" /> : <Download size={14} />}
                  MP3
                </button>
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => download(completed.id, 'wav')} disabled={downloading !== null}>
                  {downloading === 'wav' ? <span className="spinner spinner-dark" /> : <Download size={14} />}
                  WAV
                </button>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => openPlayer(completed)}>
                  Details
                </button>
              </div>
            </div>
          </div>
        )}
      </section>

      <Banner />

      <section className="recents" aria-label="Recents">
        <div className="section-head">
          <h2 className="t-h2">Recents</h2>
          <Link to="/library" className="section-link">
            View all <ArrowRight size={14} />
          </Link>
        </div>

        {recentsLoading ? (
          <div className="gen-grid">
            {Array.from({ length: 4 }).map((_, i) => (
              <GenerationCardSkeleton key={i} />
            ))}
          </div>
        ) : recents.length === 0 ? (
          <div className="empty">
            <span className="empty-icon">
              <Waves size={20} />
            </span>
            <p className="empty-title">Nothing generated yet</p>
            <p className="empty-text">Your generations will show up here. Type something above and hit Generate.</p>
          </div>
        ) : (
          <div className="gen-grid">
            {recents.map((generation) => (
              <GenerationCard key={generation.id} generation={generation} onClick={openPlayer} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
