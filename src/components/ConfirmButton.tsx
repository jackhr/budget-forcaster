import { useEffect, useRef, useState } from 'react';

interface Props {
  onConfirm: () => void;
  title?: string;
  children: React.ReactNode; // trigger content (e.g. ✕)
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
          style={{ background: 'var(--color-border)', color: 'var(--color-text)', padding: '5px 8px', fontSize: 12 }}
        >
          ✕
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
