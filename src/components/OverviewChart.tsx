import { useState } from 'react';
import {
  ComposedChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine,
} from 'recharts';
import { formatCompactMoney, formatMoney } from '../lib/format';
import RangeControl from './RangeControl';
import { Button, ChartPanel, ChartTooltip, SeriesToggle } from '../ui';

export interface OverviewPoint {
  label: string;
  income: number;    // monthly inflow
  expenses: number;  // monthly ongoing expense cash
  cash: number;      // total account balance
  debt: number;      // total remaining debt
}

interface PayoffMarker { label: string; name: string }

interface Props {
  data: OverviewPoint[];
  startMonth: number;
  months: number;
  onStartMonthChange: (m: number) => void;
  onMonthsChange: (m: number) => void;
  payoffMarkers: PayoffMarker[];
}

type SeriesKey = 'income' | 'expenses' | 'cash' | 'debt';

interface SeriesMeta {
  key: SeriesKey;
  name: string;
  color: string;
  axis: 'flow' | 'bal';
  kind: 'line' | 'bar';
}

const SERIES: SeriesMeta[] = [
  { key: 'income', name: 'Income / mo', color: 'var(--color-income)', axis: 'flow', kind: 'line' },
  { key: 'expenses', name: 'Expenses / mo', color: 'var(--color-expense)', axis: 'flow', kind: 'line' },
  { key: 'cash', name: 'Accounts (balance)', color: 'var(--color-net-pos)', axis: 'bal', kind: 'line' },
  { key: 'debt', name: 'Debt (balance)', color: '#a78bfa', axis: 'bal', kind: 'line' },
];

const AXIS_NAME: Record<SeriesKey, string> = {
  income: 'monthly', expenses: 'monthly', cash: 'balance', debt: 'balance',
};

function CustomTooltip({ active, payload, label }: {
  active?: boolean;
  payload?: { name: string; value: number; color: string; dataKey: string }[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <ChartTooltip className="max-w-[260px]">
      <p className="mb-2 font-semibold">{label}</p>
      {payload.map((p) => (
        // Each series' colour is set by the chart, so it stays a value.
        <p key={p.dataKey} className="mb-0.5" style={{ color: p.color }}>
          {p.name}: <strong>{formatMoney(p.value)}</strong>
          <span className="opacity-60"> {AXIS_NAME[p.dataKey as SeriesKey] === 'balance' ? '' : '/mo'}</span>
        </p>
      ))}
    </ChartTooltip>
  );
}

export default function OverviewChart({ data, startMonth, months, onStartMonthChange, onMonthsChange, payoffMarkers }: Props) {
  const [hidden, setHidden] = useState<Set<SeriesKey>>(new Set());

  const toggle = (key: SeriesKey) => setHidden((prev) => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });
  const anyHidden = hidden.size > 0;

  return (
    <ChartPanel
      title="Overview"
      subtitle="Everything together — monthly flows (left axis), balances (right axis), and debt-payoff markers"
      actions={<RangeControl startMonth={startMonth} endMonth={months} onStartMonthChange={onStartMonthChange} onEndMonthChange={onMonthsChange} />}
    >
      {/* Toggle chips — payoff markers are always shown */}
      <div className="mb-4 flex flex-wrap items-center gap-1.5">
        {SERIES.map((s) => (
          <SeriesToggle
            key={s.key}
            color={s.color}
            label={s.name}
            square={s.kind === 'bar'}
            off={hidden.has(s.key)}
            onClick={() => toggle(s.key)}
            title={hidden.has(s.key) ? 'Show' : 'Hide'}
          />
        ))}
        <Button
          size="sm"
          className="ml-1 border-dashed"
          onClick={() => setHidden(anyHidden ? new Set() : new Set(SERIES.map((s) => s.key)))}
        >
          {anyHidden ? 'Show all' : 'Hide all'}
        </Button>
      </div>

      <ResponsiveContainer width="100%" height={380}>
        <ComposedChart data={data} margin={{ top: 16, right: 16, left: 8, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
          <XAxis dataKey="label" tick={{ fill: 'var(--color-text-muted)', fontSize: 11 }} tickLine={false} axisLine={{ stroke: 'var(--color-border)' }} interval={Math.max(0, Math.floor(data.length / 8) - 1)} />
          <YAxis yAxisId="flow" tickFormatter={formatCompactMoney} tick={{ fill: 'var(--color-text-muted)', fontSize: 11 }} tickLine={false} axisLine={false} width={60} />
          <YAxis yAxisId="bal" orientation="right" tickFormatter={formatCompactMoney} tick={{ fill: 'var(--color-text-muted)', fontSize: 11 }} tickLine={false} axisLine={false} width={60} />
          <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
          {payoffMarkers.map((mk, i) => (
            <ReferenceLine
              key={i}
              yAxisId="bal"
              x={mk.label}
              stroke="var(--color-income)"
              strokeDasharray="3 3"
              label={{ value: `${mk.name} paid`, position: 'top', fill: 'var(--color-income)', fontSize: 10 }}
            />
          ))}
          <Line yAxisId="flow" type="monotone" dataKey="income" name="Income / mo" stroke="var(--color-income)" strokeWidth={2} dot={false} hide={hidden.has('income')} />
          <Line yAxisId="flow" type="monotone" dataKey="expenses" name="Expenses / mo" stroke="var(--color-expense)" strokeWidth={2} dot={false} hide={hidden.has('expenses')} />
          <Line yAxisId="bal" type="monotone" dataKey="cash" name="Accounts (balance)" stroke="var(--color-net-pos)" strokeWidth={2.5} dot={false} hide={hidden.has('cash')} />
          <Line yAxisId="bal" type="monotone" dataKey="debt" name="Debt (balance)" stroke="#a78bfa" strokeWidth={2.5} dot={false} hide={hidden.has('debt')} />
        </ComposedChart>
      </ResponsiveContainer>
    </ChartPanel>
  );
}
