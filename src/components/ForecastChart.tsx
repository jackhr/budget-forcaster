import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer, ReferenceLine,
} from 'recharts';
import type { ForecastPoint } from '../types';
import { formatCompactMoney, formatMoney } from '../lib/format';
import RangeControl from './RangeControl';

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
    <div style={{
      background: 'var(--color-surface-2)',
      border: '1px solid var(--color-border)',
      borderRadius: '8px',
      padding: '12px 16px',
      fontSize: '13px',
    }}>
      <p style={{ fontWeight: 600, marginBottom: 8, color: 'var(--color-text)' }}>{label}</p>
      {payload.map((p) => (
        <p key={p.name} style={{ color: p.color, marginBottom: 4 }}>
          {p.name}: <strong>{formatMoney(p.value)}</strong>
        </p>
      ))}
    </div>
  );
}

export default function ForecastChart({ data, startMonth, months, onStartMonthChange, onMonthsChange, compareData, compareName }: Props) {
  const duration = months - startMonth;
  const merged = compareData ? data.map((d, i) => ({ ...d, compare: compareData[i] })) : data;
  return (
    <div style={{
      background: 'var(--color-surface)',
      border: '1px solid var(--color-border)',
      borderRadius: 'var(--radius)',
      padding: '24px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2 style={{ fontSize: '16px', fontWeight: 600 }}>Cash Flow Forecast</h2>
          <p style={{ color: 'var(--color-text-muted)', fontSize: '13px', marginTop: 2 }}>
            Actual monthly in/out over {duration} month{duration !== 1 ? 's' : ''} — includes future expenses
          </p>
        </div>
        <RangeControl startMonth={startMonth} endMonth={months} onStartMonthChange={onStartMonthChange} onEndMonthChange={onMonthsChange} />
      </div>

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
            formatter={(value) => <span style={{ color: 'var(--color-text)' }}>{value}</span>}
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
    </div>
  );
}
