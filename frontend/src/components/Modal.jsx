// frontend/src/components/Modal.jsx
import { useEffect } from 'react';
import { X } from 'lucide-react';

export default function Modal({
  title,
  subtitle,
  onClose,
  children,
  footer,
  width = 520,
  align = 'center',
  className = '',
  closeOnBackdrop = true,
  hideClose = false
}) {
  useEffect(() => {
    function onKey(event) {
      if (event.key === 'Escape') onClose?.();
    }
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  return (
    <div
      className={align === 'top' ? 'overlay overlay-top' : 'overlay'}
      onMouseDown={(e) => {
        if (closeOnBackdrop && e.target === e.currentTarget) onClose?.();
      }}
      role="presentation"
    >
      <div
        className={`modal ${className}`}
        style={{ maxWidth: width }}
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === 'string' ? title : undefined}
      >
        {(title || !hideClose) && (
          <div className="modal-header">
            <div>
              {title && <h2 className="modal-title">{title}</h2>}
              {subtitle && <p className="modal-subtitle">{subtitle}</p>}
            </div>
            {!hideClose && (
              <button type="button" className="btn btn-icon modal-close" onClick={onClose} aria-label="Close">
                <X size={18} />
              </button>
            )}
          </div>
        )}
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>
  );
}
