import {
  ComposedChart, Area, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer, ReferenceLine,
} from 'recharts';
import type { SavingsPoint } from '../types';
import { formatCompactMoney, formatMoney } from '../lib/format';
import RangeControl from './RangeControl';
import { ChartPanel, ChartTooltip } from '../ui';

interface PayoffMarker { label: string; name: string }

interface Props {
  data: SavingsPoint[];
  startMonth: number;
  months: number;
  onStartMonthChange: (m: number) => void;
  onMonthsChange: (m: number) => void;
  payoffMarkers?: PayoffMarker[];
  compareData?: number[];
  compareName?: string;
}

function CustomTooltip({ active, payload, label }: {
  active?: boolean;
  payload?: { payload: SavingsPoint }[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <ChartTooltip className="min-w-[190px]">
      <p className="mb-2 font-semibold text-text">{label}</p>
      <p className="mb-1 text-net-pos">Balance: <strong>{formatMoney(p.balance)}</strong></p>
      <p className="mb-1 text-income">
        Income in: <strong>{formatMoney(p.income)}</strong>
        {p.incomeLump > 0 && <span className="opacity-70"> (incl. {formatMoney(p.incomeLump)} lump)</span>}
      </p>
      <p className="mb-1 text-expense">Expenses: <strong>{formatMoney(p.expenses)}</strong></p>
      {p.debtOut > 0 && (
        <p className="text-net-neg">Debt payments: <strong>−{formatMoney(p.debtOut)}</strong></p>
      )}
    </ChartTooltip>
  );
}

export default function SavingsChart({ data, startMonth, months, onStartMonthChange, onMonthsChange, payoffMarkers = [], compareData, compareName }: Props) {
  const duration = months - startMonth;
  const todayLabel = startMonth === 0 ? data[0]?.label : undefined;
  const merged = compareData ? data.map((d, i) => ({ ...d, compare: compareData[i] })) : data;
  return (
    <ChartPanel
      title="Accumulated Savings"
      subtitle={`Running balance over ${duration} month${duration !== 1 ? 's' : ''} — green bars are lump income`}
      actions={<RangeControl startMonth={startMonth} endMonth={months} onStartMonthChange={onStartMonthChange} onEndMonthChange={onMonthsChange} />}
    >
      <ResponsiveContainer width="100%" height={360}>
        <ComposedChart data={merged} margin={{ top: 16, right: 16, left: 8, bottom: 4 }}>
          <defs>
            <linearGradient id="balanceFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--color-net-pos)" stopOpacity={0.35} />
              <stop offset="100%" stopColor="var(--color-net-pos)" stopOpacity={0.02} />
            </linearGradient>
          </defs>
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
          <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
          <Legend
            wrapperStyle={{ fontSize: '13px', paddingTop: 16 }}
            formatter={(value) => <span className="text-text">{value}</span>}
          />
          <ReferenceLine y={0} stroke="var(--color-expense)" strokeDasharray="4 4" />
          {todayLabel && (
            <ReferenceLine
              x={todayLabel}
              stroke="var(--color-text-muted)"
              strokeDasharray="2 3"
              label={{ value: 'Today', position: 'insideTopLeft', fill: 'var(--color-text-muted)', fontSize: 11 }}
            />
          )}
          {payoffMarkers.map((mk, i) => (
            <ReferenceLine
              key={i}
              x={mk.label}
              stroke="var(--color-income)"
              strokeDasharray="3 3"
              label={{ value: `${mk.name} paid`, position: 'top', fill: 'var(--color-income)', fontSize: 10 }}
            />
          ))}
          <Bar dataKey="incomeLump" name="Lump Income" fill="var(--color-income)" barSize={12} radius={[3, 3, 0, 0]} />
          <Area
            type="monotone"
            dataKey="balance"
            name="Savings Balance"
            stroke="var(--color-net-pos)"
            strokeWidth={2.5}
            fill="url(#balanceFill)"
            dot={false}
            activeDot={{ r: 4 }}
          />
          {compareData && (
            <Line type="monotone" dataKey="compare" name={`${compareName ?? 'Scenario'} (balance)`} stroke="var(--color-text-muted)" strokeWidth={2} strokeDasharray="5 4" dot={false} />
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </ChartPanel>
  );
}
