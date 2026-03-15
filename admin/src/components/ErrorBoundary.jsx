import { Component } from 'react';

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    console.error('ErrorBoundary caught:', error, info.componentStack);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          justifyContent: 'center', minHeight: '100vh', padding: 32,
          background: 'var(--bg-body)', color: 'var(--text-primary)',
          fontFamily: "'Plus Jakarta Sans', sans-serif", textAlign: 'center',
        }}>
          <img src="/Logo.webp" alt="" style={{
            width: 80, height: 80, borderRadius: '50%', objectFit: 'cover',
            border: '2px solid var(--color-primary)', marginBottom: 24, opacity: 0.7,
          }} />
          <h2 style={{ fontSize: '1.2rem', fontWeight: 700, margin: '0 0 8px' }}>
            Something went wrong
          </h2>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: '0 0 24px', maxWidth: 320 }}>
            An unexpected error occurred. Try refreshing, or tap below to recover.
          </p>
          <button
            onClick={this.handleReset}
            style={{
              padding: '12px 32px', background: 'var(--color-primary)',
              color: 'var(--text-on-primary)', border: 'none', borderRadius: 50,
              fontSize: '0.9rem', fontWeight: 600, cursor: 'pointer',
              fontFamily: "'Plus Jakarta Sans', sans-serif",
            }}
          >
            Try Again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
