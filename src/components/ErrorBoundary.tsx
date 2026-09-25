import { Component, type ErrorInfo, type ReactNode } from 'react';

interface State {
  error: Error | null;
}

/** Last-resort screen, e.g. when race data fails validation at runtime. */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(error, info.componentStack);
  }

  override render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <main className="mx-auto max-w-2xl p-8">
        <h1 className="font-display text-3xl font-bold uppercase">Something went wrong</h1>
        <p className="mt-2 text-muted">TriMap could not start. Reloading the page may help.</p>
        <pre className="mt-6 overflow-auto rounded-xl border border-line bg-surface p-4 text-xs whitespace-pre-wrap text-danger">
          {error.message}
        </pre>
      </main>
    );
  }
}
