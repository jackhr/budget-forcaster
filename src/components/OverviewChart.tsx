import { useState } from 'react';
import {
  ComposedChart, Line, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine,
} from 'recharts';
import { formatCompactMoney, formatMoney } from '../lib/format';
import RangeControl from './RangeControl';

export interface OverviewPoint {
  label: string;
  income: number;    // monthly inflow
  expenses: number;  // monthly ongoing expense cash
  future: number;    // future-expense amount this month
  cash: number;      // total account balance
  debt: number;      // total remaining debt
}

interface PayoffMarker { label: string; name: string }

interface Props {
  data: OverviewPoint[];
  months: number;
  onMonthsChange: (m: number) => void;
  payoffMarkers: PayoffMarker[];
}

type SeriesKey = 'income' | 'expenses' | 'future' | 'cash' | 'debt';

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
  { key: 'future', name: 'Future expenses / mo', color: 'var(--color-net-neg)', axis: 'flow', kind: 'bar' },
  { key: 'cash', name: 'Accounts (balance)', color: 'var(--color-net-pos)', axis: 'bal', kind: 'line' },
  { key: 'debt', name: 'Debt (balance)', color: '#a78bfa', axis: 'bal', kind: 'line' },
];

const AXIS_NAME: Record<SeriesKey, string> = {
  income: 'monthly', expenses: 'monthly', future: 'monthly', cash: 'balance', debt: 'balance',
};

function CustomTooltip({ active, payload, label }: {
  active?: boolean;
  payload?: { name: string; value: number; color: string; dataKey: string }[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: 'var(--color-surface-2)', border: '1px solid var(--color-border)', borderRadius: 8, padding: '12px 16px', fontSize: 13, maxWidth: 260 }}>
      <p style={{ fontWeight: 600, marginBottom: 8 }}>{label}</p>
      {payload.map((p) => (
        <p key={p.dataKey} style={{ color: p.color, marginBottom: 3 }}>
          {p.name}: <strong>{formatMoney(p.value)}</strong>
          <span style={{ opacity: 0.6 }}> {AXIS_NAME[p.dataKey as SeriesKey] === 'balance' ? '' : '/mo'}</span>
        </p>
      ))}
    </div>
  );
}

export default function OverviewChart({ data, months, onMonthsChange, payoffMarkers }: Props) {
  const [hidden, setHidden] = useState<Set<SeriesKey>>(new Set());

  const toggle = (key: SeriesKey) => setHidden((prev) => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });
  const anyHidden = hidden.size > 0;

  return (
    <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius)', padding: 24 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2 style={{ fontSize: 16, fontWeight: 600 }}>Overview</h2>
          <p style={{ color: 'var(--color-text-muted)', fontSize: 13, marginTop: 2 }}>
            Everything together — monthly flows (left axis), balances (right axis), and debt-payoff markers
          </p>
        </div>
        <RangeControl months={months} onMonthsChange={onMonthsChange} />
      </div>

      {/* Toggle chips — payoff markers are always shown */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', marginBottom: 16 }}>
        {SERIES.map((s) => {
          const off = hidden.has(s.key);
          return (
            <button
              key={s.key}
              onClick={() => toggle(s.key)}
              title={off ? 'Show' : 'Hide'}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                background: off ? 'transparent' : 'var(--color-surface-2)',
                border: '1px solid var(--color-border)', borderRadius: 999,
                padding: '3px 10px', fontSize: 12, fontWeight: 500,
                color: off ? 'var(--color-text-muted)' : 'var(--color-text)',
                opacity: off ? 0.55 : 1, textDecoration: off ? 'line-through' : 'none',
              }}
            >
              <span style={{ width: 10, height: 10, borderRadius: s.kind === 'bar' ? 2 : 3, background: s.color, flexShrink: 0 }} />
              {s.name}
            </button>
          );
        })}
        <button
          onClick={() => setHidden(anyHidden ? new Set() : new Set(SERIES.map((s) => s.key)))}
          style={{ background: 'transparent', color: 'var(--color-text-muted)', border: '1px dashed var(--color-border)', borderRadius: 999, padding: '3px 10px', fontSize: 12, marginLeft: 4 }}
        >
          {anyHidden ? 'Show all' : 'Hide all'}
        </button>
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
          {/* Bars first so lines sit on top */}
          <Bar yAxisId="flow" dataKey="future" name="Future expenses / mo" fill="var(--color-net-neg)" barSize={12} radius={[3, 3, 0, 0]} hide={hidden.has('future')} />
          <Line yAxisId="flow" type="monotone" dataKey="income" name="Income / mo" stroke="var(--color-income)" strokeWidth={2} dot={false} hide={hidden.has('income')} />
          <Line yAxisId="flow" type="monotone" dataKey="expenses" name="Expenses / mo" stroke="var(--color-expense)" strokeWidth={2} dot={false} hide={hidden.has('expenses')} />
          <Line yAxisId="bal" type="monotone" dataKey="cash" name="Accounts (balance)" stroke="var(--color-net-pos)" strokeWidth={2.5} dot={false} hide={hidden.has('cash')} />
          <Line yAxisId="bal" type="monotone" dataKey="debt" name="Debt (balance)" stroke="#a78bfa" strokeWidth={2.5} dot={false} hide={hidden.has('debt')} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
