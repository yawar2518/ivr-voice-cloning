// frontend/src/components/ErrorBoundary.jsx
import { Component } from 'react';
import './ErrorBoundary.css';

// React error boundaries must be class components — no hook equivalent
// exists (as of React 19) for catching render-time exceptions.
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
            <h1 className="error-boundary-title">Something went wrong.</h1>
            <p className="error-boundary-subtitle">Please refresh the page.</p>
            <button
              type="button"
              className="error-boundary-refresh-btn"
              onClick={() => window.location.reload()}
            >
              Refresh
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
