// frontend/src/components/Skeleton.jsx
import './Skeleton.css';

export function SkeletonBlock({ className = '', style }) {
  return <div className={`skeleton-block ${className}`} style={style} aria-hidden="true" />;
}

export function GenerationCardSkeleton() {
  return (
    <div className="gen-card-skeleton" aria-hidden="true">
      <SkeletonBlock className="skeleton-square" />
      <SkeletonBlock className="skeleton-line" />
      <SkeletonBlock className="skeleton-line skeleton-line-short" />
    </div>
  );
}

export function VoiceCardSkeleton() {
  return (
    <div className="voice-card-skeleton" aria-hidden="true">
      <SkeletonBlock className="skeleton-circle" />
      <SkeletonBlock className="skeleton-line" />
      <SkeletonBlock className="skeleton-line skeleton-line-short" />
      <SkeletonBlock className="skeleton-button" />
    </div>
  );
}
