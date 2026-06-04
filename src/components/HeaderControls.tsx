import { CURRENCIES, formatMoney } from '../lib/format';

interface Props {
  totalCash: number;
  currency: string;
  onCurrencyChange: (code: string) => void;
  inflation: number;
  onInflationChange: (value: number) => void;
}

export default function HeaderControls({ totalCash, currency, onCurrencyChange, inflation, onInflationChange }: Props) {
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
      }}
        title="Total across all accounts — edit balances in the Accounts section"
      >
        <span style={{ fontSize: 11, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>
          Total Cash
        </span>
        <span style={{ color: 'var(--color-primary)', fontWeight: 700, fontSize: 15 }}>
          {formatMoney(totalCash, { whole: true })}
        </span>
      </div>

      <div style={{
        display: 'flex', alignItems: 'center', gap: 6,
        background: 'var(--color-bg)', border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-sm)', padding: '5px 10px',
      }}>
        <span style={{ fontSize: 11, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>
          Inflation
        </span>
        <input
          type="number"
          value={inflation}
          onChange={(e) => onInflationChange(parseFloat(e.target.value) || 0)}
          min={0}
          max={50}
          step="any"
          title="Annual inflation applied to ongoing expenses"
          style={{ width: 52, padding: '2px 4px', fontWeight: 600 }}
        />
        <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>%</span>
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
