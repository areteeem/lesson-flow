import { Component } from 'react';
import { isDebugMode, recordDebugEvent } from '../utils/debug';

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    recordDebugEvent('react_error_boundary', {
      message: error?.message || 'Unknown render error',
      stack: error?.stack || null,
      componentStack: info?.componentStack || null,
      boundaryMessage: this.props.message || null,
    }, 'error');
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-[200px] flex-col items-center justify-center gap-4 p-6 text-center">
          <div className="text-3xl">!</div>
          <p className="text-sm text-zinc-600">
            {this.props.message || 'Something went wrong rendering this section.'}
          </p>
          {isDebugMode() && this.state.error && (
            <pre className="max-w-full overflow-auto border border-zinc-200 bg-zinc-50 p-3 text-left text-xs text-zinc-700">
              {this.state.error.stack || this.state.error.message}
            </pre>
          )}
          <button
            type="button"
            onClick={() => this.setState({ hasError: false, error: null })}
            className="border border-zinc-200 px-4 py-2.5 text-sm text-zinc-700 transition hover:border-zinc-900"
          >
            Try Again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
