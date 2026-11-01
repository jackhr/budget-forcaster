import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer, ReferenceLine,
} from 'recharts';
import type { ForecastPoint } from '../types';
import { formatCompactMoney, formatMoney } from '../lib/format';
import RangeControl from './RangeControl';
import { ChartPanel, ChartTooltip } from '../ui';

interface Props {
  data: ForecastPoint[];
  startMonth: number;
  months: number;
  onStartMonthChange: (m: number) => void;
  onMonthsChange: (m: number) => void;
  compareData?: number[];
  compareName?: string;
}

function CustomTooltip({ active, payload, label }: {
  active?: boolean;
  payload?: { name: string; value: number; color: string }[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <ChartTooltip>
      <p className="mb-2 font-semibold text-text">{label}</p>
      {payload.map((p) => (
        // Each series' colour is set by the chart, so it stays a value.
        <p key={p.name} className="mb-1" style={{ color: p.color }}>
          {p.name}: <strong>{formatMoney(p.value)}</strong>
        </p>
      ))}
    </ChartTooltip>
  );
}

export default function ForecastChart({ data, startMonth, months, onStartMonthChange, onMonthsChange, compareData, compareName }: Props) {
  const duration = months - startMonth;
  const merged = compareData ? data.map((d, i) => ({ ...d, compare: compareData[i] })) : data;
  return (
    <ChartPanel
      title="Cash Flow Forecast"
      subtitle={`Actual monthly in/out over ${duration} month${duration !== 1 ? 's' : ''}`}
      actions={<RangeControl startMonth={startMonth} endMonth={months} onStartMonthChange={onStartMonthChange} onEndMonthChange={onMonthsChange} />}
    >
      <ResponsiveContainer width="100%" height={320}>
        <LineChart data={merged} margin={{ top: 4, right: 16, left: 8, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
          <XAxis
            dataKey="label"
            tick={{ fill: 'var(--color-text-muted)', fontSize: 11 }}
            tickLine={false}
            axisLine={{ stroke: 'var(--color-border)' }}
            interval={Math.max(0, Math.floor(data.length / 8) - 1)}
          />
          <YAxis
            tickFormatter={formatCompactMoney}
            tick={{ fill: 'var(--color-text-muted)', fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            width={64}
          />
          <Tooltip content={<CustomTooltip />} />
          <Legend
            wrapperStyle={{ fontSize: '13px', paddingTop: 16 }}
            formatter={(value) => <span className="text-text">{value}</span>}
          />
          <ReferenceLine y={0} stroke="var(--color-border)" strokeDasharray="4 4" />
          <Line
            type="monotone"
            dataKey="income"
            name="Income"
            stroke="var(--color-income)"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4 }}
          />
          <Line
            type="monotone"
            dataKey="expenses"
            name="Expenses"
            stroke="var(--color-expense)"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4 }}
          />
          <Line
            type="monotone"
            dataKey="net"
            name="Net Cash Flow"
            stroke="var(--color-net-pos)"
            strokeWidth={2.5}
            dot={false}
            activeDot={{ r: 4 }}
            strokeDasharray=""
          />
          {compareData && (
            <Line type="monotone" dataKey="compare" name={`${compareName ?? 'Scenario'} (net)`} stroke="var(--color-text-muted)" strokeWidth={2} strokeDasharray="5 4" dot={false} />
          )}
        </LineChart>
      </ResponsiveContainer>
    </ChartPanel>
  );
}
