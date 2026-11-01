import { createContext, useCallback, useContext, useRef, useState } from 'react';
import { AlertTriangle, CircleCheck } from 'lucide-react';
import { cx } from '../ui';

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

const TONES: Record<ToastKind, string> = {
  error: 'border-danger/50 bg-danger/15 text-danger',
  success: 'border-income/50 bg-income/15 text-income',
  info: 'border-border bg-surface-2 text-text',
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
      <div
        role="status"
        aria-live="polite"
        className="fixed bottom-5 right-5 z-[200] flex max-w-[min(90vw,360px)] flex-col gap-2"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            onClick={() => remove(t.id)}
            className={cx(
              'flex animate-toast-in cursor-pointer items-start gap-2 rounded-control border px-3.5 py-2.5 text-[13px] shadow-pop',
              TONES[t.kind],
            )}
          >
            {t.kind === 'error' && <AlertTriangle size={14} strokeWidth={2} className="mt-0.5 shrink-0" aria-hidden="true" />}
            {t.kind === 'success' && <CircleCheck size={14} strokeWidth={2} className="mt-0.5 shrink-0" aria-hidden="true" />}
            <span>{t.message}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
