import { useState } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { formatMoney, formatCompactMoney } from '../lib/format';
import RangeControl from './RangeControl';

interface AcctOpt { id: number; name: string; is_primary: 0 | 1 }

interface Props {
  accounts: AcctOpt[];
  labels: string[];
  expenseOut: Map<number, number[]>;
  scheduledOut: Map<number, number[]>;
  debtOut: Map<number, number[]>;
  startMonth: number;
  months: number;
  onStartMonthChange: (m: number) => void;
  onMonthsChange: (m: number) => void;
}

const PALETTE = ['#38bdf8', '#f43f5e', '#a78bfa', '#fb923c', '#facc15', '#2dd4bf', '#f472b6', '#60a5fa', '#c084fc', '#4ade80', '#fca5a5', '#22c55e'];
const round2 = (n: number) => Math.round(n * 100) / 100;

function CustomTooltip({ active, payload, label }: {
  active?: boolean;
  payload?: { name: string; value: number; color: string }[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  const rows = [...payload].filter((p) => p.value > 0.005).sort((a, b) => b.value - a.value);
  const total = rows.reduce((s, p) => s + p.value, 0);
  return (
    <div style={{ background: 'var(--color-surface-2)', border: '1px solid var(--color-border)', borderRadius: 8, padding: '12px 16px', fontSize: 13, maxWidth: 280 }}>
      <p style={{ fontWeight: 600, marginBottom: 8 }}>{label}</p>
      {rows.map((p) => (
        <p key={p.name} style={{ color: p.color, marginBottom: 3 }}>{p.name}: −{formatMoney(p.value)}</p>
      ))}
      <p style={{ fontWeight: 700, marginTop: 6, borderTop: '1px solid var(--color-border)', paddingTop: 6 }}>Total out: −{formatMoney(total)}</p>
    </div>
  );
}

export default function AccountOutflows({ accounts, labels, expenseOut, scheduledOut, debtOut, startMonth, months, onStartMonthChange, onMonthsChange }: Props) {
  const duration = months - startMonth;
  const [view, setView] = useState<'graph' | 'list'>('graph');

  const colorOf = (i: number) => PALETTE[i % PALETTE.length];
  const cell = (id: number, m: number) => ({
    expense: expenseOut.get(id)?.[m] ?? 0,
    future: scheduledOut.get(id)?.[m] ?? 0,
    debt: debtOut.get(id)?.[m] ?? 0,
  });
  const totalFor = (id: number, m: number) => { const c = cell(id, m); return c.expense + c.future + c.debt; };

  // One row per month; a key per account holding its total outflow that month.
  const data = labels.map((label, i) => {
    const row: Record<string, number | string> = { label };
    accounts.forEach((a) => { row[`a${a.id}`] = round2(totalFor(a.id, i)); });
    return row;
  });

  // Horizon totals (per account + grand) and the peak month, for the summary.
  const acctTotals = accounts.map((a) => labels.reduce((s, _l, i) => s + totalFor(a.id, i), 0));
  const grandTotal = acctTotals.reduce((s, v) => s + v, 0);
  const monthTotals = labels.map((_l, i) => accounts.reduce((s, a) => s + totalFor(a.id, i), 0));

  const card: React.CSSProperties = { background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius)', padding: 24 };
  const th: React.CSSProperties = { fontSize: 11, fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'right', padding: '6px 10px', whiteSpace: 'nowrap' };
  const td: React.CSSProperties = { fontSize: 12.5, textAlign: 'right', padding: '6px 10px', whiteSpace: 'nowrap' };

  if (accounts.length === 0) {
    return (
      <div style={card}>
        <h2 style={{ fontSize: 16, fontWeight: 600 }}>Account Outflows</h2>
        <p style={{ color: 'var(--color-text-muted)', fontSize: 13, marginTop: 6 }}>Add an account to see what's drawn from each per month.</p>
      </div>
    );
  }

  return (
    <div style={card}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2 style={{ fontSize: 16, fontWeight: 600 }}>Account Outflows</h2>
          <p style={{ color: 'var(--color-text-muted)', fontSize: 13, marginTop: 2 }}>What's drawn from each account per month (expenses, future expenses, and debt payments).</p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', gap: 4, background: 'var(--color-bg)', padding: 4, borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)' }}>
            {(['graph', 'list'] as const).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                style={{
                  background: view === v ? 'var(--color-surface-2)' : 'transparent',
                  color: view === v ? 'var(--color-text)' : 'var(--color-text-muted)',
                  border: `1px solid ${view === v ? 'var(--color-border)' : 'transparent'}`,
                  padding: '5px 14px', fontWeight: 600, fontSize: 13, textTransform: 'capitalize',
                }}
              >
                {v}
              </button>
            ))}
          </div>
          <RangeControl startMonth={startMonth} endMonth={months} onStartMonthChange={onStartMonthChange} onEndMonthChange={onMonthsChange} />
        </div>
      </div>

      {/* Summary */}
      <div style={{ display: 'flex', gap: 24, marginBottom: 16, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 11, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total out · {duration} mo</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--color-expense)' }}>{formatMoney(grandTotal, { whole: true })}</div>
        </div>
        <div>
          <div style={{ fontSize: 11, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Avg / month</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--color-text)' }}>{formatMoney(duration ? grandTotal / duration : 0, { whole: true })}</div>
        </div>
      </div>

      {view === 'graph' ? (
        <ResponsiveContainer width="100%" height={360}>
          <BarChart data={data} margin={{ top: 8, right: 16, left: 8, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
            <XAxis dataKey="label" tick={{ fill: 'var(--color-text-muted)', fontSize: 11 }} tickLine={false} axisLine={{ stroke: 'var(--color-border)' }} interval={Math.max(0, Math.floor(data.length / 8) - 1)} />
            <YAxis tickFormatter={formatCompactMoney} tick={{ fill: 'var(--color-text-muted)', fontSize: 11 }} tickLine={false} axisLine={false} width={64} />
            <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
            <Legend wrapperStyle={{ fontSize: 13, paddingTop: 8 }} formatter={(value) => <span style={{ color: 'var(--color-text)' }}>{value}</span>} />
            {accounts.map((a, i) => (
              <Bar key={a.id} dataKey={`a${a.id}`} name={a.name} stackId="out" fill={colorOf(i)} radius={i === accounts.length - 1 ? [3, 3, 0, 0] : undefined} maxBarSize={48} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 480 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
                <th style={{ ...th, textAlign: 'left' }}>Month</th>
                {accounts.map((a, i) => (
                  <th key={a.id} style={th}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ width: 8, height: 8, borderRadius: 2, background: colorOf(i), display: 'inline-block' }} />
                      {a.name}{a.is_primary ? ' ★' : ''}
                    </span>
                  </th>
                ))}
                <th style={th}>Total</th>
              </tr>
            </thead>
            <tbody>
              {labels.map((label, m) => (
                <tr key={label} style={{ borderBottom: '1px solid var(--color-border)' }}>
                  <td style={{ ...td, textAlign: 'left', fontWeight: 600 }}>{label}</td>
                  {accounts.map((a) => {
                    const c = cell(a.id, m);
                    const t = c.expense + c.future + c.debt;
                    return (
                      <td key={a.id} style={{ ...td, color: t > 0.005 ? 'var(--color-text)' : 'var(--color-text-muted)' }}
                        title={t > 0.005 ? `Expenses ${formatMoney(c.expense)} · Future ${formatMoney(c.future)} · Debt ${formatMoney(c.debt)}` : 'Nothing out'}>
                        {t > 0.005 ? formatMoney(t, { whole: true }) : '—'}
                      </td>
                    );
                  })}
                  <td style={{ ...td, fontWeight: 700, color: 'var(--color-expense)' }}>{monthTotals[m] > 0.005 ? formatMoney(monthTotals[m], { whole: true }) : '—'}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td style={{ ...td, textAlign: 'left', fontWeight: 700, textTransform: 'uppercase', fontSize: 11, color: 'var(--color-text-muted)' }}>Total</td>
                {acctTotals.map((t, i) => (
                  <td key={accounts[i].id} style={{ ...td, fontWeight: 700 }}>{formatMoney(t, { whole: true })}</td>
                ))}
                <td style={{ ...td, fontWeight: 700, color: 'var(--color-expense)' }}>{formatMoney(grandTotal, { whole: true })}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
