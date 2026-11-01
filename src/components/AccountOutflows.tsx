import { useState } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { formatMoney, formatCompactMoney } from '../lib/format';
import RangeControl from './RangeControl';
import { Star } from 'lucide-react';
import { Panel, Segmented, cx } from '../ui';

interface AcctOpt { id: number; name: string; is_primary: 0 | 1 }

interface Props {
  accounts: AcctOpt[];
  labels: string[];
  expenseOut: Map<number, number[]>;
  debtOut: Map<number, number[]>;
  startMonth: number;
  months: number;
  onStartMonthChange: (m: number) => void;
  onMonthsChange: (m: number) => void;
}

const PALETTE = ['#38bdf8', '#f43f5e', '#a78bfa', '#fb923c', '#facc15', '#2dd4bf', '#f472b6', '#60a5fa', '#c084fc', '#4ade80', '#fca5a5', '#22c55e'];
const round2 = (n: number) => Math.round(n * 100) / 100;

const TH = 'whitespace-nowrap px-2.5 py-1.5 text-right text-[11px] font-semibold uppercase tracking-wider text-muted';
const TD = 'whitespace-nowrap px-2.5 py-1.5 text-right text-[12.5px] tabular-nums';

function CustomTooltip({ active, payload, label }: {
  active?: boolean;
  payload?: { name: string; value: number; color: string }[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  const rows = [...payload].filter((p) => p.value > 0.005).sort((a, b) => b.value - a.value);
  const total = rows.reduce((s, p) => s + p.value, 0);
  return (
    <div className="max-w-[280px] rounded-lg border border-border bg-surface-2 px-4 py-3 text-[13px] shadow-pop">
      <p className="mb-2 font-semibold">{label}</p>
      {rows.map((p) => (
        // Each series' colour comes from the palette, so it has to be a value.
        <p key={p.name} className="mb-0.5" style={{ color: p.color }}>{p.name}: −{formatMoney(p.value)}</p>
      ))}
      <p className="mt-1.5 border-t border-border pt-1.5 font-bold">Total out: −{formatMoney(total)}</p>
    </div>
  );
}

export default function AccountOutflows({ accounts, labels, expenseOut, debtOut, startMonth, months, onStartMonthChange, onMonthsChange }: Props) {
  const duration = months - startMonth;
  const [view, setView] = useState<'graph' | 'list'>('graph');

  const colorOf = (i: number) => PALETTE[i % PALETTE.length];
  const cell = (id: number, m: number) => ({
    expense: expenseOut.get(id)?.[m] ?? 0,
    debt: debtOut.get(id)?.[m] ?? 0,
  });
  const totalFor = (id: number, m: number) => { const c = cell(id, m); return c.expense + c.debt; };

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

  if (accounts.length === 0) {
    return (
      <Panel className="p-6">
        <h2 className="text-base font-semibold tracking-tight">Account Outflows</h2>
        <p className="mt-1.5 text-[13px] text-muted">Add an account to see what's drawn from each per month.</p>
      </Panel>
    );
  }

  return (
    <Panel className="p-6">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-base font-semibold tracking-tight">Account Outflows</h2>
          <p className="mt-0.5 text-[13px] text-muted">
            What's drawn from each account per month (expenses and debt payments).
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Segmented
            ariaLabel="Outflow view"
            options={[{ id: 'graph', label: 'Graph' }, { id: 'list', label: 'List' }]}
            value={view}
            onChange={setView}
          />
          <RangeControl startMonth={startMonth} endMonth={months} onStartMonthChange={onStartMonthChange} onEndMonthChange={onMonthsChange} />
        </div>
      </div>

      {/* Summary */}
      <div className="mb-4 flex flex-wrap gap-6">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wider text-muted">Total out · {duration} mo</div>
          <div className="text-xl font-bold tabular-nums text-expense">{formatMoney(grandTotal, { whole: true })}</div>
        </div>
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wider text-muted">Avg / month</div>
          <div className="text-xl font-bold tabular-nums text-text">{formatMoney(duration ? grandTotal / duration : 0, { whole: true })}</div>
        </div>
      </div>

      {view === 'graph' ? (
        <ResponsiveContainer width="100%" height={360}>
          <BarChart data={data} margin={{ top: 8, right: 16, left: 8, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
            <XAxis dataKey="label" tick={{ fill: 'var(--color-text-muted)', fontSize: 11 }} tickLine={false} axisLine={{ stroke: 'var(--color-border)' }} interval={Math.max(0, Math.floor(data.length / 8) - 1)} />
            <YAxis tickFormatter={formatCompactMoney} tick={{ fill: 'var(--color-text-muted)', fontSize: 11 }} tickLine={false} axisLine={false} width={64} />
            <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
            <Legend wrapperStyle={{ fontSize: 13, paddingTop: 8 }} formatter={(value) => <span className="text-text">{value}</span>} />
            {accounts.map((a, i) => (
              <Bar key={a.id} dataKey={`a${a.id}`} name={a.name} stackId="out" fill={colorOf(i)} radius={i === accounts.length - 1 ? [3, 3, 0, 0] : undefined} maxBarSize={48} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[480px] border-collapse">
            <thead>
              <tr className="border-b border-border">
                <th className={cx(TH, 'text-left')}>Month</th>
                {accounts.map((a, i) => (
                  <th key={a.id} className={TH}>
                    <span className="inline-flex items-center gap-1.5">
                      {/* The series colour comes from the palette, so it's a value. */}
                      <span className="inline-block h-2 w-2 rounded-sm" style={{ background: colorOf(i) }} />
                      {a.name}
                      {a.is_primary && (
                        <Star size={11} fill="currentColor" strokeWidth={0} className="text-warning" aria-label="Primary account" />
                      )}
                    </span>
                  </th>
                ))}
                <th className={TH}>Total</th>
              </tr>
            </thead>
            <tbody>
              {labels.map((label, m) => (
                <tr key={label} className="border-b border-border">
                  <td className={cx(TD, 'text-left font-semibold')}>{label}</td>
                  {accounts.map((a) => {
                    const c = cell(a.id, m);
                    const t = c.expense + c.debt;
                    return (
                      <td
                        key={a.id}
                        className={cx(TD, t > 0.005 ? 'text-text' : 'text-muted')}
                        title={t > 0.005 ? `Expenses ${formatMoney(c.expense)} · Debt ${formatMoney(c.debt)}` : 'Nothing out'}
                      >
                        {t > 0.005 ? formatMoney(t, { whole: true }) : '—'}
                      </td>
                    );
                  })}
                  <td className={cx(TD, 'font-bold text-expense')}>
                    {monthTotals[m] > 0.005 ? formatMoney(monthTotals[m], { whole: true }) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td className={cx(TD, 'text-left text-[11px] font-bold uppercase text-muted')}>Total</td>
                {acctTotals.map((t, i) => (
                  <td key={accounts[i].id} className={cx(TD, 'font-bold')}>{formatMoney(t, { whole: true })}</td>
                ))}
                <td className={cx(TD, 'font-bold text-expense')}>{formatMoney(grandTotal, { whole: true })}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </Panel>
  );
}
