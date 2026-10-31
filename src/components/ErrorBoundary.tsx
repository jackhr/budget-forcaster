import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props { children: ReactNode }
interface State { error: Error | null }

/**
 * Without this, any render error unmounts the whole tree and the user gets a
 * blank page with no way to tell what happened or how to recover.
 *
 * The "reset view preferences" escape hatch is here because stale localStorage
 * is a likely cause: ids persisted by an older build (a tab, a chart, a
 * breakdown section) may no longer exist in the current one.
 */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Unhandled render error:', error, info.componentStack);
  }

  clearViewPrefs = () => {
    try {
      for (const key of Object.keys(localStorage)) {
        if (key.startsWith('bf.')) localStorage.removeItem(key);
      }
    } catch { /* storage unavailable; the reload below is still worth a try */ }
    location.reload();
  };

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="flex min-h-full items-center justify-center bg-bg px-6 py-12">
        <div className="w-full max-w-[460px] rounded-card border border-border bg-surface p-7 shadow-card">
          <h1 className="text-lg font-semibold tracking-tight">Something broke while drawing this page</h1>
          <p className="mt-2 text-[13.5px] text-muted">
            Your data is safe — this is a display problem, not a data one. Nothing was saved or changed.
          </p>

          <pre className="mt-4 max-h-40 overflow-auto rounded-control border border-border bg-bg px-3 py-2 text-[11.5px] leading-relaxed text-danger">
            {error.message || String(error)}
          </pre>

          <div className="mt-5 flex flex-wrap gap-2">
            <button
              onClick={() => location.reload()}
              className="h-9 rounded-control bg-primary px-4 text-[13px] font-medium text-white hover:bg-primary-hover"
            >
              Reload
            </button>
            <button
              onClick={this.clearViewPrefs}
              className="h-9 rounded-control border border-border bg-surface-2 px-4 text-[13px] font-medium text-text hover:border-border-strong"
            >
              Reset view preferences and reload
            </button>
          </div>

          <p className="mt-3 text-[12px] text-muted">
            Resetting clears only layout choices — which tab, chart and date range you had open.
          </p>
        </div>
      </div>
    );
  }
}
