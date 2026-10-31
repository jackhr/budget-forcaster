import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';

interface Props {
  onConfirm: () => void;
  title?: string;
  children: React.ReactNode; // trigger content (usually an icon)
  triggerStyle?: React.CSSProperties;
  confirmLabel?: string;
}

// Two-step inline confirmation: first click reveals confirm/cancel, avoiding accidental deletes.
export default function ConfirmButton({ onConfirm, title, children, triggerStyle, confirmLabel = 'Delete?' }: Props) {
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
      <span style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
        <button
          onClick={() => { window.clearTimeout(timer.current); setConfirming(false); onConfirm(); }}
          style={{ background: 'var(--color-expense)', color: '#fff', padding: '5px 10px', fontSize: 12, fontWeight: 600 }}
        >
          {confirmLabel}
        </button>
        <button
          onClick={() => { window.clearTimeout(timer.current); setConfirming(false); }}
          aria-label="Cancel"
          style={{ background: 'var(--color-border)', color: 'var(--color-text)', padding: '5px 7px', display: 'grid', placeItems: 'center' }}
        >
          <X size={14} strokeWidth={2.2} aria-hidden="true" />
        </button>
      </span>
    );
  }

  return (
    <button onClick={arm} title={title} style={triggerStyle}>
      {children}
    </button>
  );
}
