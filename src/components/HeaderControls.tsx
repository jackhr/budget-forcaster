import { useEffect, useState } from 'react';
import { CURRENCIES, formatMoney } from '../lib/format';

interface Props {
  startingBalance: number;
  onStartingBalanceChange: (value: number) => void;
  currency: string;
  onCurrencyChange: (code: string) => void;
}

export default function HeaderControls({ startingBalance, onStartingBalanceChange, currency, onCurrencyChange }: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(startingBalance));

  useEffect(() => {
    if (!editing) setDraft(String(startingBalance));
  }, [startingBalance, editing]);

  function commit() {
    const v = parseFloat(draft);
    setEditing(false);
    if (!isNaN(v) && v >= 0 && v !== startingBalance) onStartingBalanceChange(v);
    else setDraft(String(startingBalance));
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        background: 'var(--color-bg)',
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-sm)',
        padding: '5px 10px',
      }}>
        <span style={{ fontSize: 11, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>
          Current Cash
        </span>
        {editing ? (
          <input
            type="number"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commit();
              if (e.key === 'Escape') { setEditing(false); setDraft(String(startingBalance)); }
            }}
            autoFocus
            min={0}
            style={{ width: 110, fontWeight: 700, padding: '2px 6px' }}
          />
        ) : (
          <button
            onClick={() => setEditing(true)}
            title="Click to edit your current cash on hand"
            style={{ background: 'transparent', color: 'var(--color-primary)', fontWeight: 700, fontSize: 15, padding: 0 }}
          >
            {formatMoney(startingBalance, { whole: true })}
          </button>
        )}
      </div>

      <select
        value={currency}
        onChange={(e) => onCurrencyChange(e.target.value)}
        title="Display currency"
        style={{
          background: 'var(--color-bg)',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-sm)',
          color: 'var(--color-text)',
          padding: '7px 8px',
          fontSize: 12,
          fontFamily: 'inherit',
        }}
      >
        {CURRENCIES.map((c) => (
          <option key={c.code} value={c.code}>{c.label}</option>
        ))}
      </select>
    </div>
  );
}
