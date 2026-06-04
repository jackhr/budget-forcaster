import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import type { Breakdown } from '../lib/forecast';
import { formatCompactMoney, formatMoney } from '../lib/format';
import RangeControl from './RangeControl';

interface Props {
  title: string;
  subtitle: string;
  breakdown: Breakdown;
  months: number;
  onMonthsChange: (m: number) => void;
}

const PALETTE = ['#22c55e', '#f43f5e', '#38bdf8', '#a78bfa', '#fb923c', '#facc15', '#2dd4bf', '#f472b6', '#60a5fa', '#c084fc', '#4ade80', '#fca5a5'];

function CustomTooltip({ active, payload, label }: {
  active?: boolean;
  payload?: { name: string; value: number; color: string; dataKey: string }[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  const rows = [...payload].sort((a, b) => (a.dataKey === 'total' ? -1 : b.dataKey === 'total' ? 1 : b.value - a.value));
  return (
    <div style={{ background: 'var(--color-surface-2)', border: '1px solid var(--color-border)', borderRadius: 8, padding: '12px 16px', fontSize: 13, maxWidth: 260 }}>
      <p style={{ fontWeight: 600, marginBottom: 8 }}>{label}</p>
      {rows.map((p) => (
        <p key={p.dataKey} style={{ color: p.dataKey === 'total' ? 'var(--color-text)' : p.color, marginBottom: 3, fontWeight: p.dataKey === 'total' ? 700 : 400 }}>
          {p.name}: {formatMoney(p.value)}
        </p>
      ))}
    </div>
  );
}

export default function BreakdownChart({ title, subtitle, breakdown, months, onMonthsChange }: Props) {
  const { labels, total, series } = breakdown;
  const data = labels.map((label, i) => {
    const row: Record<string, number | string> = { label, total: total[i] ?? 0 };
    series.forEach((s) => { row[`k${s.id}`] = s.values[i] ?? 0; });
    return row;
  });

  return (
    <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius)', padding: 24 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2 style={{ fontSize: 16, fontWeight: 600 }}>{title}</h2>
          <p style={{ color: 'var(--color-text-muted)', fontSize: 13, marginTop: 2 }}>{subtitle}</p>
        </div>
        <RangeControl months={months} onMonthsChange={onMonthsChange} />
      </div>

      {series.length === 0 ? (
        <div style={{ height: 320, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-text-muted)', fontSize: 13 }}>
          Nothing to break down yet — add some items.
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={360}>
          <LineChart data={data} margin={{ top: 4, right: 16, left: 8, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
            <XAxis dataKey="label" tick={{ fill: 'var(--color-text-muted)', fontSize: 11 }} tickLine={false} axisLine={{ stroke: 'var(--color-border)' }} interval={Math.max(0, Math.floor(data.length / 8) - 1)} />
            <YAxis tickFormatter={formatCompactMoney} tick={{ fill: 'var(--color-text-muted)', fontSize: 11 }} tickLine={false} axisLine={false} width={64} />
            <Tooltip content={<CustomTooltip />} />
            <Legend wrapperStyle={{ fontSize: 12.5, paddingTop: 16 }} formatter={(v) => <span style={{ color: 'var(--color-text)' }}>{v}</span>} />
            {series.map((s, idx) => (
              <Line key={s.id} type="monotone" dataKey={`k${s.id}`} name={s.name} stroke={PALETTE[idx % PALETTE.length]} strokeWidth={1.5} dot={false} activeDot={{ r: 3 }} />
            ))}
            <Line type="monotone" dataKey="total" name="Total (all combined)" stroke="var(--color-text)" strokeWidth={3} dot={false} activeDot={{ r: 4 }} />
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
