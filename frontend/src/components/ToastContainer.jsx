// frontend/src/components/ToastContainer.jsx
import { CircleAlert, CircleCheck, Info, X } from 'lucide-react';
import './ToastContainer.css';

const ICONS = {
  success: CircleCheck,
  error: CircleAlert,
  info: Info
};

export default function ToastContainer({ toasts, onDismiss }) {
  if (toasts.length === 0) return null;

  return (
    <div className="toast-container" role="status" aria-live="polite">
      {toasts.map((toast) => {
        const Icon = ICONS[toast.type] ?? Info;
        return (
          <div key={toast.id} className={`toast toast-${toast.type}`}>
            <Icon size={16} className="toast-icon" aria-hidden="true" />
            <span className="toast-message">{toast.message}</span>
            <button
              type="button"
              className="toast-dismiss"
              onClick={() => onDismiss(toast.id)}
              aria-label="Dismiss notification"
            >
              <X size={13} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
