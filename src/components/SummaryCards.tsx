import type { ForecastPoint } from '../types';
import { formatMoney } from '../lib/format';
import { StatCard, StatGrid } from '../ui';

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
      className: 'text-income',
    },
    {
      label: 'Current Monthly Expenses',
      value: first ? fmt(first.expenses) : '—',
      sub: null,
      className: 'text-expense',
    },
    {
      label: 'Current Net Cash Flow',
      value: first ? fmt(first.net) : '—',
      sub: null,
      className: first && first.net >= 0 ? 'text-net-pos' : 'text-net-neg',
    },
    {
      label: 'Projected Net (End of Period)',
      value: last ? fmt(last.net) : '—',
      sub: first && last ? pct(first.net, last.net) + ' change' : null,
      className: last && last.net >= 0 ? 'text-net-pos' : 'text-net-neg',
    },
  ];

  return (
    <StatGrid>
      {cards.map((card) => (
        <StatCard key={card.label} label={card.label} value={card.value} sub={card.sub} className={card.className} />
      ))}
    </StatGrid>
  );
}
