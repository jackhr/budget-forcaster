import type { SavingsPoint } from '../types';
import { formatMoney, formatSignedMoney } from '../lib/format';

interface Props {
  data: SavingsPoint[];
  startingBalance: number;
}

export default function SavingsSummary({ data, startingBalance }: Props) {
  const ending = data.length ? data[data.length - 1].balance : startingBalance;
  const change = ending - startingBalance;
  const lowest = data.length ? Math.min(...data.map((d) => d.balance)) : startingBalance;
  const goesNegative = lowest < 0;

  const cards = [
    {
      label: 'Projected Balance',
      value: formatMoney(ending, { whole: true }),
      color: ending >= 0 ? 'var(--color-net-pos)' : 'var(--color-net-neg)',
      sub: 'end of period',
    },
    {
      label: 'Net Change',
      value: formatSignedMoney(change, { whole: true }),
      color: change >= 0 ? 'var(--color-income)' : 'var(--color-expense)',
      sub: 'from current cash',
    },
    {
      label: 'Lowest Balance',
      value: formatMoney(lowest, { whole: true }),
      color: goesNegative ? 'var(--color-expense)' : 'var(--color-text)',
      sub: goesNegative ? '⚠ goes negative' : 'stays positive',
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
          <span style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>{card.sub}</span>
        </div>
      ))}
    </div>
  );
}
