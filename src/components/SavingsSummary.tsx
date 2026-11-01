import type { SavingsPoint } from '../types';
import { formatMoney, formatSignedMoney } from '../lib/format';
import { StatCard, StatGrid } from '../ui';

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
      className: ending >= 0 ? 'text-net-pos' : 'text-net-neg',
      sub: 'end of period',
    },
    {
      label: 'Net Change',
      value: formatSignedMoney(change, { whole: true }),
      className: change >= 0 ? 'text-income' : 'text-expense',
      sub: 'over selected period',
    },
    {
      label: 'Lowest Balance',
      value: formatMoney(lowest, { whole: true }),
      className: goesNegative ? 'text-expense' : 'text-text',
      sub: goesNegative ? 'goes negative' : 'stays positive',
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
