import { useEffect, useRef, useState } from 'react';

interface Props {
  month: number;
  onMonthChange: (month: number) => void;
}

const MAX_MONTH = 119;
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function dateAtOffset(offset: number): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth() + offset, 1);
}

export default function MonthControl({ month, onMonthChange }: Props) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const selected = dateAtOffset(month);
  const now = dateAtOffset(0);
  const max = dateAtOffset(MAX_MONTH);
  const years = Array.from({ length: max.getFullYear() - now.getFullYear() + 1 }, (_, i) => now.getFullYear() + i);

  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  const choose = (year: number, selectedMonth: number) => {
    const offset = (year - now.getFullYear()) * 12 + selectedMonth - now.getMonth();
    onMonthChange(Math.max(0, Math.min(MAX_MONTH, offset)));
    setOpen(false);
  };

  const chooseYear = (year: number) => {
    const offset = (year - now.getFullYear()) * 12 + selected.getMonth() - now.getMonth();
    onMonthChange(Math.max(0, Math.min(MAX_MONTH, offset)));
  };

  const buttonStyle: React.CSSProperties = {
    background: 'var(--color-surface-2)',
    color: 'var(--color-text)',
    border: '1px solid var(--color-border)',
    borderRadius: 6,
    width: 36,
    height: 32,
    padding: 0,
    fontSize: 17,
    fontWeight: 700,
  };

  return (
    <div ref={containerRef} style={{ display: 'flex', alignItems: 'center', gap: 6, position: 'relative' }}>
      <button type="button" onClick={() => onMonthChange(month - 1)} disabled={month <= 0} aria-label="Previous month" title="Previous month" style={buttonStyle}>←</button>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        title="Choose month"
        style={{
          background: 'var(--color-surface-2)',
          color: 'var(--color-text)',
          border: '1px solid var(--color-border)',
          borderRadius: 6,
          padding: '6px 12px',
          minWidth: 152,
          fontSize: 12.5,
          fontWeight: 600,
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {MONTH_NAMES[selected.getMonth()]} {selected.getFullYear()}
      </button>
      <button type="button" onClick={() => onMonthChange(month + 1)} disabled={month >= MAX_MONTH} aria-label="Next month" title="Next month" style={buttonStyle}>→</button>

      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 6px)', right: 42, zIndex: 20,
          background: 'var(--color-surface-2)', border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-sm)', padding: 10, boxShadow: '0 12px 32px rgba(0,0,0,0.35)',
          display: 'flex', flexDirection: 'column', gap: 8, minWidth: 220,
        }}>
          <select
            value={selected.getFullYear()}
            onChange={(e) => chooseYear(Number(e.target.value))}
            style={{ background: 'var(--color-bg)', color: 'var(--color-text)', border: '1px solid var(--color-border)', borderRadius: 6, padding: '6px 8px' }}
          >
            {years.map((year) => <option key={year} value={year}>{year}</option>)}
          </select>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 4 }}>
            {MONTH_NAMES.map((name, index) => {
              const offset = (selected.getFullYear() - now.getFullYear()) * 12 + index - now.getMonth();
              const disabled = offset < 0 || offset > MAX_MONTH;
              const active = selected.getMonth() === index;
              return (
                <button
                  key={name}
                  type="button"
                  disabled={disabled}
                  onClick={() => choose(selected.getFullYear(), index)}
                  style={{
                    background: active ? 'var(--color-primary)' : 'var(--color-bg)',
                    color: active ? '#fff' : 'var(--color-text)',
                    border: '1px solid var(--color-border)', borderRadius: 5,
                    padding: '5px 4px', fontSize: 11,
                  }}
                >
                  {name.slice(0, 3)}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
