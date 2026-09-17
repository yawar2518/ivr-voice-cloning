// frontend/src/components/Orb.jsx
// Pure-CSS animated sphere used on generation cards and in the player.
import './Orb.css';

export default function Orb({ gradient, size = 80, className = '', paused = false }) {
  const style = {
    '--orb-from': gradient.from,
    '--orb-to': gradient.to,
    '--orb-size': `${size}px`
  };
  return (
    <span className={`orb ${paused ? 'orb-paused' : ''} ${className}`} style={style} aria-hidden="true">
      <span className="orb-core" />
      <span className="orb-highlight" />
      <span className="orb-ring" />
    </span>
  );
}
