import {
  ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer, ReferenceLine,
} from 'recharts';
import type { NetWorthPoint } from '../types';
import { formatCompactMoney, formatMoney } from '../lib/format';
import RangeControl from './RangeControl';
import { ChartPanel, ChartTooltip } from '../ui';

export interface PayoffMarker { label: string; name: string }

interface Props {
  data: NetWorthPoint[];
  startMonth: number;
  months: number;
  onStartMonthChange: (m: number) => void;
  onMonthsChange: (m: number) => void;
  payoffMarkers: PayoffMarker[];
  compareData?: number[];
  compareName?: string;
}

function CustomTooltip({ active, payload, label }: {
  active?: boolean;
  payload?: { payload: NetWorthPoint }[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <ChartTooltip className="min-w-[180px]">
      <p className="mb-2 font-semibold">{label}</p>
      <p className="mb-1 text-primary">Net worth: <strong>{formatMoney(p.netWorth)}</strong></p>
      <p className="mb-1 text-net-pos">Cash: <strong>{formatMoney(p.cash)}</strong></p>
      <p className="text-net-neg">Debt: <strong>−{formatMoney(p.debt)}</strong></p>
    </ChartTooltip>
  );
}

export default function NetWorthChart({ data, startMonth, months, onStartMonthChange, onMonthsChange, payoffMarkers, compareData, compareName }: Props) {
  const duration = months - startMonth;
  const merged = compareData ? data.map((d, i) => ({ ...d, compare: compareData[i] })) : data;
  return (
    <ChartPanel
      title="Net Worth"
      subtitle={`Cash minus remaining debt over ${duration} month${duration !== 1 ? 's' : ''} — flags mark each debt payoff`}
      actions={<RangeControl startMonth={startMonth} endMonth={months} onStartMonthChange={onStartMonthChange} onEndMonthChange={onMonthsChange} />}
    >
      <ResponsiveContainer width="100%" height={360}>
        <ComposedChart data={merged} margin={{ top: 16, right: 16, left: 8, bottom: 4 }}>
          <defs>
            <linearGradient id="nwFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--color-primary)" stopOpacity={0.3} />
              <stop offset="100%" stopColor="var(--color-primary)" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
          <XAxis dataKey="label" tick={{ fill: 'var(--color-text-muted)', fontSize: 11 }} tickLine={false} axisLine={{ stroke: 'var(--color-border)' }} interval={Math.max(0, Math.floor(data.length / 8) - 1)} />
          <YAxis tickFormatter={formatCompactMoney} tick={{ fill: 'var(--color-text-muted)', fontSize: 11 }} tickLine={false} axisLine={false} width={64} />
          <Tooltip content={<CustomTooltip />} />
          <Legend wrapperStyle={{ fontSize: 13, paddingTop: 16 }} formatter={(v) => <span className="text-text">{v}</span>} />
          <ReferenceLine y={0} stroke="var(--color-expense)" strokeDasharray="4 4" />
          {payoffMarkers.map((mk, i) => (
            <ReferenceLine
              key={i}
              x={mk.label}
              stroke="var(--color-income)"
              strokeDasharray="3 3"
              label={{ value: `${mk.name} paid`, position: 'top', fill: 'var(--color-income)', fontSize: 10 }}
            />
          ))}
          <Area type="monotone" dataKey="cash" name="Cash" stroke="var(--color-net-pos)" strokeWidth={1.5} fill="none" dot={false} />
          <Line type="monotone" dataKey="debt" name="Debt" stroke="var(--color-net-neg)" strokeWidth={1.5} dot={false} />
          <Area type="monotone" dataKey="netWorth" name="Net Worth" stroke="var(--color-primary)" strokeWidth={2.5} fill="url(#nwFill)" dot={false} activeDot={{ r: 4 }} />
          {compareData && (
            <Line type="monotone" dataKey="compare" name={`${compareName ?? 'Scenario'} (net worth)`} stroke="var(--color-text-muted)" strokeWidth={2} strokeDasharray="5 4" dot={false} />
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </ChartPanel>
  );
}
