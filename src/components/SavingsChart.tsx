import {
  ComposedChart, Area, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer, ReferenceLine, LabelList,
} from 'recharts';
import type { SavingsPoint } from '../types';
import { formatCompactMoney, formatMoney } from '../lib/format';

interface Props {
  data: SavingsPoint[];
  months: number;
  onMonthsChange: (m: number) => void;
}

function CustomTooltip({ active, payload, label }: {
  active?: boolean;
  payload?: { payload: SavingsPoint }[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div style={{
      background: 'var(--color-surface-2)',
      border: '1px solid var(--color-border)',
      borderRadius: '8px',
      padding: '12px 16px',
      fontSize: '13px',
      minWidth: 190,
    }}>
      <p style={{ fontWeight: 600, marginBottom: 8, color: 'var(--color-text)' }}>{label}</p>
      <p style={{ color: 'var(--color-net-pos)', marginBottom: 4 }}>
        Balance: <strong>{formatMoney(p.balance)}</strong>
      </p>
      <p style={{ color: 'var(--color-income)', marginBottom: 4 }}>
        Income in: <strong>{formatMoney(p.income)}</strong>
        {p.incomeLump > 0 && <span style={{ opacity: 0.7 }}> (incl. {formatMoney(p.incomeLump)} lump)</span>}
      </p>
      <p style={{ color: 'var(--color-expense)', marginBottom: 4 }}>
        Expenses: <strong>{formatMoney(p.expenses)}</strong>
      </p>
      {p.scheduledOut > 0 && (
        <p style={{ color: 'var(--color-net-neg)' }}>
          {p.scheduledLabel || 'Scheduled'}: <strong>−{formatMoney(p.scheduledOut)}</strong>
        </p>
      )}
      {p.debtOut > 0 && (
        <p style={{ color: 'var(--color-net-neg)' }}>
          Debt payments: <strong>−{formatMoney(p.debtOut)}</strong>
        </p>
      )}
    </div>
  );
}

// Renders the future-expense name above its bar.
function PaymentLabel(props: { x: number; y: number; width: number; index: number; data: SavingsPoint[] }) {
  const { x, y, width, index, data } = props;
  const point = data[index];
  if (!point || point.scheduledOut <= 0) return null;
  const name = point.scheduledLabel.length > 14 ? point.scheduledLabel.slice(0, 13) + '…' : point.scheduledLabel;
  return (
    <text x={x + width / 2} y={y - 4} fill="var(--color-net-neg)" fontSize={10} textAnchor="middle">
      {name}
    </text>
  );
}

export default function SavingsChart({ data, months, onMonthsChange }: Props) {
  const todayLabel = data[0]?.label;
  return (
    <div style={{
      background: 'var(--color-surface)',
      border: '1px solid var(--color-border)',
      borderRadius: 'var(--radius)',
      padding: '24px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2 style={{ fontSize: '16px', fontWeight: 600 }}>Accumulated Savings</h2>
          <p style={{ color: 'var(--color-text-muted)', fontSize: '13px', marginTop: 2 }}>
            Running balance over {months} month{months !== 1 ? 's' : ''} — green bars are lump income, red bars are future expenses
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 260 }}>
          <span style={{ color: 'var(--color-text-muted)', fontSize: '13px', whiteSpace: 'nowrap' }}>1 mo</span>
          <input type="range" min={1} max={60} value={months} onChange={(e) => onMonthsChange(Number(e.target.value))} style={{ flex: 1 }} />
          <span style={{ color: 'var(--color-text-muted)', fontSize: '13px', whiteSpace: 'nowrap' }}>60 mo</span>
          <span style={{
            background: 'var(--color-primary)', color: '#fff', borderRadius: '6px',
            padding: '2px 8px', fontSize: '12px', fontWeight: 600, minWidth: 40, textAlign: 'center',
          }}>{months}</span>
        </div>
      </div>

      <ResponsiveContainer width="100%" height={360}>
        <ComposedChart data={data} margin={{ top: 16, right: 16, left: 8, bottom: 4 }}>
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
            formatter={(value) => <span style={{ color: 'var(--color-text)' }}>{value}</span>}
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
          <Bar dataKey="incomeLump" name="Lump Income" fill="var(--color-income)" barSize={12} radius={[3, 3, 0, 0]} />
          <Bar dataKey="scheduledOut" name="Future Expense" fill="var(--color-net-neg)" barSize={12} radius={[3, 3, 0, 0]}>
            <LabelList
              dataKey="scheduledOut"
              content={(props: { x?: string | number; y?: string | number; width?: string | number; index?: number }) => (
                <PaymentLabel
                  x={Number(props.x) || 0}
                  y={Number(props.y) || 0}
                  width={Number(props.width) || 0}
                  index={props.index ?? 0}
                  data={data}
                />
              )}
            />
          </Bar>
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
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
