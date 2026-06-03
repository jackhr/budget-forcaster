import { createContext, useCallback, useContext, useRef, useState } from 'react';

type ToastKind = 'error' | 'success' | 'info';

interface Toast {
  id: number;
  kind: ToastKind;
  message: string;
}

interface ToastApi {
  notify: (message: string, kind?: ToastKind) => void;
  error: (message: string) => void;
  success: (message: string) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within <ToastProvider>');
  return ctx;
}

const COLORS: Record<ToastKind, { bg: string; border: string; fg: string }> = {
  error: { bg: '#3b1318', border: '#7f1d1d', fg: '#fca5a5' },
  success: { bg: '#0f2a1a', border: '#15803d', fg: '#86efac' },
  info: { bg: 'var(--color-surface-2)', border: 'var(--color-border)', fg: 'var(--color-text)' },
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const remove = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const notify = useCallback((message: string, kind: ToastKind = 'info') => {
    const id = nextId.current++;
    setToasts((prev) => [...prev, { id, kind, message }]);
    setTimeout(() => remove(id), 4500);
  }, [remove]);

  const api: ToastApi = {
    notify,
    error: (m) => notify(m, 'error'),
    success: (m) => notify(m, 'success'),
  };

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div style={{
        position: 'fixed',
        bottom: 20,
        right: 20,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        zIndex: 200,
        maxWidth: 'min(90vw, 360px)',
      }}>
        {toasts.map((t) => {
          const c = COLORS[t.kind];
          return (
            <div
              key={t.id}
              onClick={() => remove(t.id)}
              style={{
                background: c.bg,
                border: `1px solid ${c.border}`,
                color: c.fg,
                borderRadius: 'var(--radius-sm)',
                padding: '10px 14px',
                fontSize: 13,
                boxShadow: 'var(--shadow)',
                cursor: 'pointer',
                animation: 'toastIn 0.18s ease-out',
              }}
            >
              {t.kind === 'error' ? '⚠ ' : t.kind === 'success' ? '✓ ' : ''}{t.message}
            </div>
          );
        })}
      </div>
      <style>{`@keyframes toastIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }`}</style>
    </ToastContext.Provider>
  );
}
