// frontend/src/components/GenerationCard.jsx
import { Loader2, TriangleAlert } from 'lucide-react';
import Orb from './Orb';
import { gradientFor, relativeTime } from '../utils/format';
import './GenerationCard.css';

export default function GenerationCard({ generation, onClick }) {
  const gradient = gradientFor(generation.id);
  const isProcessing = generation.status === 'processing';
  const isFailed = generation.status === 'failed';

  return (
    <button
      type="button"
      className="gen-card"
      onClick={() => onClick?.(generation)}
      data-testid="generation-card"
      aria-label={`Open generation: ${generation.text.slice(0, 60)}`}
    >
      <span
        className="gen-card-art"
        style={{
          '--card-from': gradient.from,
          '--card-to': gradient.to
        }}
      >
        <span className="gen-card-glow" aria-hidden="true" />
        {isFailed ? (
          <span className="gen-card-state gen-card-state-failed">
            <TriangleAlert size={22} strokeWidth={1.8} />
          </span>
        ) : (
          <Orb gradient={gradient} size={80} paused={isProcessing} />
        )}
        {isProcessing && (
          <span className="gen-card-state gen-card-state-processing">
            <Loader2 size={20} className="gen-card-spin" />
          </span>
        )}
        <span className="gen-card-badge">
          {isFailed ? 'Failed' : isProcessing ? 'Generating' : 'Text to Speech'}
        </span>
      </span>
      <span className="gen-card-meta">
        <span className="gen-card-text">{generation.text}</span>
        <span className="gen-card-time">{relativeTime(generation.created_at)}</span>
      </span>
    </button>
  );
}
