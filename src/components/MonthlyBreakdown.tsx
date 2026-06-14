import { useState } from 'react';
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { MonthBreakdown, MonthObligation, MonthObligationKind } from '../lib/monthlyBreakdown';
import { formatCompactMoney, formatMoney, formatSignedMoney } from '../lib/format';
import MonthControl from './MonthControl';

interface Props {
  breakdown: MonthBreakdown;
  month: number;
  onMonthChange: (month: number) => void;
  initialView: 'daily' | 'calendar';
}

const KIND: Record<MonthObligationKind, { label: string; color: string }> = {
  income: { label: 'Income', color: 'var(--color-income)' },
  expense: { label: 'Expense', color: 'var(--color-expense)' },
  future: { label: 'Future', color: 'var(--color-net-neg)' },
  debt: { label: 'Debt', color: '#a78bfa' },
};

function DailyTooltip({ active, payload, label }: { active?: boolean; payload?: { payload: { dailyIn: number; dailyOut: number; moneyIn: number; moneyOut: number; net: number; events: MonthObligation[] } }[]; label?: string }) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  const incoming = row.events.filter((event) => event.direction === 'in');
  const outgoing = row.events.filter((event) => event.direction === 'out');
  const items = (events: MonthObligation[], color: string, sign: string) => events.map((event) => (
    <div key={event.key} style={{ display: 'flex', gap: 12, justifyContent: 'space-between', marginTop: 4 }}>
      <span style={{ color: 'var(--color-text)' }}>
        {event.name}
        <span style={{ color: 'var(--color-text-muted)', fontSize: 10 }}> · {event.paid ? (event.kind === 'income' ? 'received' : 'paid') : 'expected'} · {event.detail}</span>
      </span>
      <strong style={{ color, whiteSpace: 'nowrap' }}>{sign}{formatMoney(event.amount)}</strong>
    </div>
  ));
  return (
    <div style={{ background: 'var(--color-surface-2)', border: '1px solid var(--color-border)', borderRadius: 8, padding: '10px 14px', fontSize: 12, minWidth: 280, maxWidth: 460 }}>
      <strong>Day {label}</strong>
      {incoming.length > 0 && (
        <div style={{ marginTop: 8 }}>
          <p style={{ color: 'var(--color-income)', fontWeight: 700 }}>Money in · +{formatMoney(row.dailyIn)}</p>
          {items(incoming, 'var(--color-income)', '+')}
        </div>
      )}
      {outgoing.length > 0 && (
        <div style={{ marginTop: 8 }}>
          <p style={{ color: 'var(--color-expense)', fontWeight: 700 }}>Money out · −{formatMoney(row.dailyOut)}</p>
          {items(outgoing, 'var(--color-expense)', '−')}
        </div>
      )}
      {row.events.length === 0 && <p style={{ color: 'var(--color-text-muted)', marginTop: 6 }}>No activity scheduled.</p>}
      <p style={{ color: 'var(--color-text-muted)', marginTop: 6 }}>Cumulative net: {formatSignedMoney(row.net)}</p>
    </div>
  );
}

function Event({ event }: { event: MonthObligation }) {
  const meta = KIND[event.kind];
  return (
    <div title={`${event.name} · ${event.detail} · ${formatMoney(event.amount)}`} style={{
      borderLeft: `3px solid ${meta.color}`, background: 'var(--color-bg)', borderRadius: 5,
      padding: '4px 6px', opacity: event.paid ? 0.55 : 1, minWidth: 0,
    }}>
      <div style={{ display: 'flex', gap: 4, justifyContent: 'space-between', alignItems: 'baseline' }}>
        <strong style={{ fontSize: 10.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{event.name}</strong>
        <span style={{ fontSize: 10, color: event.direction === 'in' ? 'var(--color-income)' : 'var(--color-expense)', whiteSpace: 'nowrap', textDecoration: event.paid ? 'line-through' : 'none' }}>
          {event.direction === 'in' ? '+' : '−'}{formatMoney(event.amount, { whole: true })}
        </span>
      </div>
      <div style={{ color: 'var(--color-text-muted)', fontSize: 9.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {!event.dateSpecified ? 'Date not set · ' : ''}{event.paid ? `✓ ${event.kind === 'income' ? 'received' : 'paid'} · ` : ''}{event.detail}
      </div>
    </div>
  );
}

export default function MonthlyBreakdown({ breakdown, month, onMonthChange, initialView }: Props) {
  const [view, setView] = useState<'daily' | 'calendar' | 'liquidity'>(initialView);
  const [liquidityKey, setLiquidityKey] = useState('total');
  const firstWeekday = new Date(breakdown.year, breakdown.month, 1).getDay();
  const cells = [...Array(firstWeekday).fill(null), ...Array.from({ length: breakdown.days }, (_, index) => index + 1)];
  while (cells.length % 7) cells.push(null);
  const today = new Date();
  const isCurrentMonth = today.getFullYear() === breakdown.year && today.getMonth() === breakdown.month;

  const card = (label: string, value: string, color: string) => (
    <div style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', padding: '10px 14px', minWidth: 130 }}>
      <div style={{ fontSize: 10, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>{label}</div>
      <div style={{ color, fontSize: 18, fontWeight: 700, marginTop: 2 }}>{value}</div>
    </div>
  );

  return (
    <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius)', padding: 24 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ fontSize: 16, fontWeight: 600 }}>Monthly Obligations</h2>
          <p style={{ color: 'var(--color-text-muted)', fontSize: 13, marginTop: 2 }}>Completed and expected inflows and obligations across {breakdown.label}</p>
        </div>
        <MonthControl month={month} onMonthChange={onMonthChange} />
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 16, flexWrap: 'wrap' }}>
        {card('Money in', formatMoney(breakdown.totalIn, { whole: true }), 'var(--color-income)')}
        {card('Money out', formatMoney(breakdown.totalOut, { whole: true }), 'var(--color-expense)')}
        {card('Net', formatSignedMoney(breakdown.net, { whole: true }), breakdown.net >= 0 ? 'var(--color-income)' : 'var(--color-expense)')}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 4, alignSelf: 'center', background: 'var(--color-bg)', padding: 4, border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)' }}>
          {(['daily', 'calendar', 'liquidity'] as const).map((option) => (
            <button key={option} onClick={() => setView(option)} style={{
              background: view === option ? 'var(--color-primary)' : 'transparent', color: view === option ? '#fff' : 'var(--color-text-muted)',
              border: 'none', borderRadius: 5, padding: '6px 12px', fontSize: 12, fontWeight: 600, textTransform: 'capitalize',
            }}>{option === 'daily' ? 'Daily chart' : option === 'calendar' ? 'Calendar' : 'Liquidity'}</button>
          ))}
        </div>
      </div>

      {view === 'daily' ? (
        <div style={{ marginTop: 20 }}>
          <ResponsiveContainer width="100%" height={390}>
            <LineChart data={breakdown.daily} margin={{ top: 8, right: 16, left: 8, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
              <XAxis dataKey="label" interval={0} tick={{ fill: 'var(--color-text-muted)', fontSize: 9 }} tickLine={false} axisLine={{ stroke: 'var(--color-border)' }} />
              <YAxis tickFormatter={formatCompactMoney} tick={{ fill: 'var(--color-text-muted)', fontSize: 11 }} tickLine={false} axisLine={false} width={64} />
              <Tooltip content={<DailyTooltip />} />
              <Line type="stepAfter" dataKey="moneyIn" name="Cumulative money in" stroke="var(--color-income)" strokeWidth={2} dot={false} />
              <Line type="stepAfter" dataKey="moneyOut" name="Cumulative money out" stroke="var(--color-expense)" strokeWidth={2} dot={false} />
              <Line type="stepAfter" dataKey="net" name="Cumulative net" stroke="var(--color-text)" strokeWidth={3} dot={false} />
            </LineChart>
          </ResponsiveContainer>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 16, color: 'var(--color-text-muted)', fontSize: 11, flexWrap: 'wrap' }}>
            <span style={{ color: 'var(--color-income)' }}>━ Money in</span><span style={{ color: 'var(--color-expense)' }}>━ Money out</span><span style={{ color: 'var(--color-text)' }}>━ Net</span>
          </div>
        </div>
      ) : view === 'calendar' ? (
        <div style={{ marginTop: 20, overflowX: 'auto' }}>
          <div style={{ minWidth: 760 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 6, marginBottom: 6 }}>
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => <div key={day} style={{ color: 'var(--color-text-muted)', textAlign: 'center', fontSize: 10, fontWeight: 700, textTransform: 'uppercase' }}>{day}</div>)}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 6 }}>
              {cells.map((day, index) => {
                const events = day ? breakdown.events.filter((event) => event.day === day) : [];
                const current = !!day && isCurrentMonth && day === today.getDate();
                return (
                  <div key={index} style={{ minHeight: 132, background: day ? 'var(--color-surface-2)' : 'transparent', border: `1px solid ${current ? 'var(--color-primary)' : 'var(--color-border)'}`, borderRadius: 7, padding: 6 }}>
                    {day && <div style={{ fontSize: 11, fontWeight: 700, color: current ? 'var(--color-primary)' : 'var(--color-text-muted)', marginBottom: 5 }}>{day}</div>}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>{events.map((event) => <Event key={event.key} event={event} />)}</div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      ) : (
        <LiquidityChart breakdown={breakdown} selected={liquidityKey} onSelect={setLiquidityKey} />
      )}
    </div>
  );
}

function LiquidityChart({ breakdown, selected, onSelect }: { breakdown: MonthBreakdown; selected: string; onSelect: (key: string) => void }) {
  const series = breakdown.liquidity.find((item) => item.key === selected) ?? breakdown.liquidity[0];
  const data = breakdown.daily.map((point, index) => ({ ...point, liquidity: series?.values[index] ?? 0 }));
  const finalValue = series?.values[series.values.length - 1] ?? 0;
  const today = new Date();
  const todayLabel = today.getFullYear() === breakdown.year && today.getMonth() === breakdown.month ? String(today.getDate()) : null;

  return (
    <div style={{ marginTop: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
        <div>
          <h3 style={{ fontSize: 14, fontWeight: 600 }}>Available to Play With</h3>
          <p style={{ color: 'var(--color-text-muted)', fontSize: 11.5, marginTop: 2 }}>
            Reconstructed completed activity through today, followed by expected cash and card-credit changes.
          </p>
        </div>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ color: 'var(--color-text-muted)', fontSize: 10, fontWeight: 600, textTransform: 'uppercase' }}>Liquidity source</span>
          <select value={selected} onChange={(event) => onSelect(event.target.value)} style={{ minWidth: 220 }}>
            <option value="total">All liquidity</option>
            <option value="accounts">All cash accounts</option>
            <optgroup label="Cash accounts">
              {breakdown.liquidity.filter((item) => item.kind === 'account').map((item) => <option key={item.key} value={item.key}>{item.name}</option>)}
            </optgroup>
            <optgroup label="Credit cards">
              {breakdown.liquidity.filter((item) => item.kind === 'card').map((item) => <option key={item.key} value={item.key}>{item.name}</option>)}
            </optgroup>
          </select>
        </label>
      </div>
      <div style={{ color: finalValue > 0 ? 'var(--color-income)' : 'var(--color-expense)', fontSize: 20, fontWeight: 700, marginBottom: 6 }}>
        {formatMoney(finalValue)} <span style={{ color: 'var(--color-text-muted)', fontSize: 11, fontWeight: 500 }}>available at month end</span>
      </div>
      <ResponsiveContainer width="100%" height={390}>
        <LineChart data={data} margin={{ top: 8, right: 16, left: 8, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
          <XAxis dataKey="label" interval={0} tick={{ fill: 'var(--color-text-muted)', fontSize: 9 }} tickLine={false} axisLine={{ stroke: 'var(--color-border)' }} />
          <YAxis tickFormatter={formatCompactMoney} tick={{ fill: 'var(--color-text-muted)', fontSize: 11 }} tickLine={false} axisLine={false} width={64} />
          {todayLabel && <ReferenceLine x={todayLabel} stroke="var(--color-text-muted)" strokeDasharray="4 4" label={{ value: 'Today', fill: 'var(--color-text-muted)', fontSize: 10, position: 'insideTopRight' }} />}
          <Tooltip content={<LiquidityTooltip name={series?.name ?? 'All liquidity'} seriesKey={series?.key ?? 'total'} />} />
          <Line type="stepAfter" dataKey="liquidity" name={series?.name ?? 'All liquidity'} stroke="var(--color-primary)" strokeWidth={3} dot={false} activeDot={{ r: 4 }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function LiquidityTooltip({ active, payload, label, name, seriesKey }: { active?: boolean; payload?: { payload: { liquidity: number; events: MonthObligation[] } }[]; label?: string; name: string; seriesKey: string }) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  const effects = row.events.map((event) => ({
    event,
    effect: event.liquidityChanges.filter((change) => seriesKey === 'total' || (seriesKey === 'accounts' && change.kind === 'account') || change.key === seriesKey).reduce((sum, change) => sum + change.amount, 0),
  })).filter(({ effect }) => seriesKey === 'total' || Math.abs(effect) > 0.005);
  return (
    <div style={{ background: 'var(--color-surface-2)', border: '1px solid var(--color-border)', borderRadius: 8, padding: '10px 14px', fontSize: 12, minWidth: 240, maxWidth: 420 }}>
      <strong>Day {label} · {name}</strong>
      <p style={{ color: 'var(--color-primary)', fontWeight: 700, marginTop: 6 }}>{formatMoney(row.liquidity)} available</p>
      {effects.length > 0 && (
        <div style={{ marginTop: 8 }}>
          <p style={{ color: 'var(--color-text-muted)', fontSize: 10, fontWeight: 700, textTransform: 'uppercase' }}>Day’s balance changes</p>
          {effects.map(({ event, effect }) => (
            <p key={event.key} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginTop: 3 }}>
              <span>{event.name}</span>
              <strong style={{ color: effect > 0.005 ? 'var(--color-income)' : effect < -0.005 ? 'var(--color-expense)' : 'var(--color-text-muted)', whiteSpace: 'nowrap' }}>
                {Math.abs(effect) <= 0.005 ? 'no net change' : formatSignedMoney(effect)}
              </strong>
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
