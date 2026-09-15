// frontend/src/components/VoiceProfileSidebar.jsx
import { SkeletonBlock } from './Skeleton';
import './VoiceProfileSidebar.css';

const LANGUAGE_LABELS = {
  english: 'English',
  urdu: 'Urdu',
  hindi: 'Hindi',
  bilingual: 'Bilingual'
};

function displayNameFor(model) {
  return model.display_name ?? `${model.provider} — ${model.model_variant} (${model.version_label})`;
}

function VoiceProfileCardSkeleton() {
  return (
    <div className="voice-profile-card voice-profile-card-skeleton" aria-hidden="true">
      <SkeletonBlock className="voice-profile-skeleton-name" />
      <SkeletonBlock className="voice-profile-skeleton-badge" />
    </div>
  );
}

export default function VoiceProfileSidebar({
  voiceModels,
  selectedVoiceModelId,
  onSelect,
  isLoading,
  error,
  canManage,
  onUploadClick,
  onDelete,
  pendingActivateId,
  pendingDeleteId
}) {
  return (
    <aside className="voice-profile-sidebar">
      <div className="voice-profile-sidebar-header">
        <h2 className="voice-profile-sidebar-title">Voice Profiles</h2>
        <p className="voice-profile-sidebar-subtitle">Select a voice to generate with</p>
      </div>

      <div className="voice-profile-list">
        {isLoading &&
          Array.from({ length: 4 }, (_, i) => <VoiceProfileCardSkeleton key={i} />)}

        {!isLoading && error && (
          <div className="voice-profile-sidebar-status voice-profile-sidebar-status-error" role="alert">
            {error}
          </div>
        )}

        {!isLoading && !error && voiceModels.length === 0 && (
          <div className="voice-profile-sidebar-status">No voice profiles yet.</div>
        )}

        {!isLoading &&
          !error &&
          voiceModels.map((model) => {
            const isSelected = model.id === selectedVoiceModelId;
            const isActivating = pendingActivateId === model.id;
            const isDeleting = pendingDeleteId === model.id;
            const language = model.language;

            return (
              <div
                key={model.id}
                className={
                  isSelected
                    ? 'voice-profile-card voice-profile-card-selected'
                    : 'voice-profile-card'
                }
                onClick={() => onSelect(model)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onSelect(model);
                  }
                }}
              >
                <div className="voice-profile-card-main">
                  <span className="voice-profile-card-name">{displayNameFor(model)}</span>
                  <div className="voice-profile-card-meta">
                    {language && (
                      <span className={`voice-profile-lang-badge voice-profile-lang-${language}`}>
                        {LANGUAGE_LABELS[language] ?? language}
                      </span>
                    )}
                    {model.is_active && (
                      <span className="voice-profile-active-indicator" title="Active voice">
                        ✓ Active
                      </span>
                    )}
                    {isActivating && (
                      <span className="voice-profile-activating">Activating…</span>
                    )}
                  </div>
                </div>

                {canManage && (
                  <button
                    type="button"
                    className="voice-profile-delete-btn"
                    disabled={model.is_active || isDeleting}
                    title={model.is_active ? 'Cannot delete the active voice' : 'Delete voice'}
                    aria-label={`Delete ${displayNameFor(model)}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      onDelete(model);
                    }}
                  >
                    {isDeleting ? '…' : '🗑'}
                  </button>
                )}
              </div>
            );
          })}
      </div>

      {canManage && (
        <button type="button" className="voice-profile-upload-btn" onClick={onUploadClick}>
          + Upload New Voice
        </button>
      )}
    </aside>
  );
}
