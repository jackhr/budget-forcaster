import type { ForecastPoint } from '../types';
import { formatMoney } from '../lib/format';

interface Props {
  data: ForecastPoint[];
}

function fmt(n: number) {
  return formatMoney(n);
}

function pct(a: number, b: number) {
  if (a === 0) return '—';
  const change = ((b - a) / Math.abs(a)) * 100;
  return (change >= 0 ? '+' : '') + change.toFixed(1) + '%';
}

export default function SummaryCards({ data }: Props) {
  const first = data[0];
  const last = data[data.length - 1];

  const cards = [
    {
      label: 'Current Monthly Income',
      value: first ? fmt(first.income) : '—',
      sub: null,
      color: 'var(--color-income)',
    },
    {
      label: 'Current Monthly Expenses',
      value: first ? fmt(first.expenses) : '—',
      sub: null,
      color: 'var(--color-expense)',
    },
    {
      label: 'Current Net Cash Flow',
      value: first ? fmt(first.net) : '—',
      sub: null,
      color: first && first.net >= 0 ? 'var(--color-net-pos)' : 'var(--color-net-neg)',
    },
    {
      label: 'Projected Net (End of Period)',
      value: last ? fmt(last.net) : '—',
      sub: first && last ? pct(first.net, last.net) + ' change' : null,
      color: last && last.net >= 0 ? 'var(--color-net-pos)' : 'var(--color-net-neg)',
    },
  ];

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
      gap: '16px',
    }}>
      {cards.map((card) => (
        <div key={card.label} style={{
          background: 'var(--color-surface)',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius)',
          padding: '20px',
          display: 'flex',
          flexDirection: 'column',
          gap: '6px',
        }}>
          <span style={{ fontSize: '12px', color: 'var(--color-text-muted)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            {card.label}
          </span>
          <span style={{ fontSize: '24px', fontWeight: 700, color: card.color, letterSpacing: '-0.02em' }}>
            {card.value}
          </span>
          {card.sub && (
            <span style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>
              {card.sub}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}
