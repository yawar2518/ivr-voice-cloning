// frontend/src/components/ErrorBoundary.jsx
import { Component } from 'react';
import { TriangleAlert } from 'lucide-react';
import './ErrorBoundary.css';

// React error boundaries must be class components — no hook equivalent
// exists for catching render-time exceptions.
export default class ErrorBoundary extends Component {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    console.error('Unhandled render error:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="error-boundary-page">
          <div className="error-boundary-card">
            <TriangleAlert className="error-boundary-icon" size={32} strokeWidth={1.5} aria-hidden="true" />
            <h1 className="error-boundary-title">Something went wrong.</h1>
            <p className="error-boundary-subtitle">Please refresh the page.</p>
            <button type="button" className="btn btn-primary" onClick={() => window.location.reload()}>
              Refresh
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
