// frontend/src/components/Skeleton.jsx
import './Skeleton.css';

export function SkeletonBlock({ className = '', style }) {
  return <div className={`skeleton-block ${className}`} style={style} aria-hidden="true" />;
}

export function PromptCardSkeleton() {
  return (
    <div className="prompt-card skeleton-card" aria-hidden="true">
      <div className="prompt-card-header">
        <SkeletonBlock className="skeleton-badge" />
        <SkeletonBlock className="skeleton-pill" />
      </div>
      <SkeletonBlock className="skeleton-line" />
      <SkeletonBlock className="skeleton-line skeleton-line-short" />
      <div className="prompt-card-footer">
        <SkeletonBlock className="skeleton-text-sm" />
        <SkeletonBlock className="skeleton-text-sm" />
      </div>
    </div>
  );
}

export function AuditRowSkeleton() {
  return (
    <div className="audit-log-entry skeleton-row" aria-hidden="true">
      <SkeletonBlock className="skeleton-badge" />
      <div className="audit-log-entry-body">
        <SkeletonBlock className="skeleton-line" />
        <SkeletonBlock className="skeleton-line skeleton-line-short" />
      </div>
      <SkeletonBlock className="skeleton-text-sm" />
    </div>
  );
}
