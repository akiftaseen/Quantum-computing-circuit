/**
 * Error Boundary Component - Catches and displays errors gracefully
 */
import React, { type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('Error Boundary caught:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        this.props.fallback || (
          <div className="error-fallback">
            <h2 className="error-fallback-title">Something went wrong</h2>
            <p className="error-fallback-message">{this.state.error?.message}</p>
            <button
              onClick={() => window.location.reload()}
              className="error-fallback-btn"
            >
              Reload Page
            </button>
          </div>
        )
      );
    }

    return this.props.children;
  }
}

/**
 * Hook for handling errors in functional components
 */
export const useErrorHandler = (onError?: (error: Error) => void) => {
  return (error: Error) => {
    console.error('Error:', error);
    onError?.(error);
  };
};
