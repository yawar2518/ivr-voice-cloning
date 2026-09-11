// frontend/src/components/ShinyButton.jsx
import './ShinyButton.css';

export default function ShinyButton({
  children,
  onClick,
  className = '',
  type = 'button',
  disabled = false,
  variant = 'pill',
  ariaLabel
}) {
  const variantClass = variant === 'icon' ? 'shiny-cta shiny-cta-icon' : 'shiny-cta';

  return (
    <button
      type={type}
      className={`${variantClass} ${className}`}
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
    >
      <span>{children}</span>
    </button>
  );
}
