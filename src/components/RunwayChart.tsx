import {
  ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ResponsiveContainer,
} from 'recharts';
import { formatCompactMoney, formatMoney } from '../lib/format';

export interface RunwayPoint {
  label: string;
  cash: number;
  debt: number;
  netWorth: number;
}

function RunwayTooltip({ active, payload, label }: {
  active?: boolean;
  payload?: { payload: RunwayPoint }[];
  label?: string;
}) {
  const point = payload?.[0]?.payload;
  if (!active || !point) return null;
  return (
    <div className="rounded-control border border-border bg-surface-2 px-3.5 py-2.5 text-[12.5px] shadow-pop">
      <p className="mb-1.5 font-semibold">{label}</p>
      <p className="text-net-pos">Cash <strong>{formatMoney(point.cash)}</strong></p>
      <p className="text-expense">Debt <strong>{formatMoney(point.debt)}</strong></p>
      <p className="mt-1 border-t border-border pt-1 text-text">
        Net worth <strong>{formatMoney(point.netWorth)}</strong>
      </p>
    </div>
  );
}

/** The 12-month shape of things: cash as an area, debt as a line against it. */
export default function RunwayChart({ data, lowIndex }: { data: RunwayPoint[]; lowIndex?: number }) {
  const tick = { fill: 'var(--color-muted)', fontSize: 11 };
  return (
    <ResponsiveContainer width="100%" height={240}>
      <ComposedChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="runwayCash" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-net-pos)" stopOpacity={0.3} />
            <stop offset="100%" stopColor="var(--color-net-pos)" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
        <XAxis dataKey="label" tick={tick} tickLine={false} axisLine={{ stroke: 'var(--color-border)' }} interval="preserveStartEnd" minTickGap={24} />
        <YAxis tickFormatter={formatCompactMoney} tick={tick} tickLine={false} axisLine={false} width={56} />
        <Tooltip content={<RunwayTooltip />} cursor={{ stroke: 'var(--color-border-strong)' }} />
        <ReferenceLine y={0} stroke="var(--color-border-strong)" />
        {lowIndex != null && data[lowIndex] && (
          <ReferenceLine
            x={data[lowIndex].label}
            stroke="var(--color-expense)"
            strokeDasharray="3 3"
            label={{ value: 'low point', position: 'top', fill: 'var(--color-expense)', fontSize: 10 }}
          />
        )}
        <Area type="monotone" dataKey="cash" name="Cash" stroke="var(--color-net-pos)" strokeWidth={2} fill="url(#runwayCash)" />
        <Line type="monotone" dataKey="debt" name="Debt" stroke="var(--color-expense)" strokeWidth={2} dot={false} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
