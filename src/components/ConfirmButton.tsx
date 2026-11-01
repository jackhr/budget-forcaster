import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { Button, IconButton, cx } from '../ui';

/** How the resting trigger looks. The armed state is always a red confirm. */
type Tone = 'danger' | 'quiet' | 'outline' | 'primary';

const TONES: Record<Tone, string> = {
  danger: 'text-danger hover:bg-danger/10',
  quiet: 'text-muted hover:bg-surface-2 hover:text-text',
  outline: 'border border-border text-muted hover:border-border-strong hover:text-text',
  primary: 'text-primary hover:bg-primary/10',
};

interface Props {
  onConfirm: () => void;
  title?: string;
  children: React.ReactNode; // trigger content (usually an icon)
  tone?: Tone;
  confirmLabel?: string;
  className?: string;
}

// Two-step inline confirmation: first click reveals confirm/cancel, avoiding accidental deletes.
export default function ConfirmButton({ onConfirm, title, children, tone = 'danger', confirmLabel = 'Delete?', className }: Props) {
  const [confirming, setConfirming] = useState(false);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  function arm() {
    setConfirming(true);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setConfirming(false), 3500);
  }

  if (confirming) {
    return (
      <span className="inline-flex shrink-0 items-center gap-1">
        <Button
          size="sm"
          onClick={() => { window.clearTimeout(timer.current); setConfirming(false); onConfirm(); }}
          variant="bare"
          className="bg-danger font-semibold text-white hover:bg-danger/90"
        >
          {confirmLabel}
        </Button>
        <IconButton tone="neutral" size="sm" onClick={() => { window.clearTimeout(timer.current); setConfirming(false); }} aria-label="Cancel">
          <X size={14} strokeWidth={2.2} aria-hidden="true" />
        </IconButton>
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={arm}
      title={title}
      className={cx(
        'inline-flex shrink-0 items-center gap-1.5 rounded-control px-2.5 py-1.5 text-[12.5px] font-medium transition-colors',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
        TONES[tone], className,
      )}
    >
      {children}
    </button>
  );
}
