import { useState } from 'react';
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { MonthBreakdown, MonthObligation, MonthObligationKind } from '../lib/monthlyBreakdown';
import { formatCompactMoney, formatMoney, formatSignedMoney } from '../lib/format';
import MonthControl from './MonthControl';
import { Panel, Segmented, cx } from '../ui';

interface Props {
  breakdown: MonthBreakdown;
  month: number;
  onMonthChange: (month: number) => void;
  initialView: 'daily' | 'calendar';
}

// The rule down the left edge of a calendar event, by what kind of thing it is.
const KIND_RAIL: Record<MonthObligationKind, string> = {
  income: 'border-l-income',
  expense: 'border-l-expense',
  debt: 'border-l-kind-debt',
};

function LegendSwatch({ className, label }: { className: string; label: string }) {
  return (
    <span className={cx('inline-flex items-center gap-1.5', className)}>
      <span className="inline-block h-0.5 w-3.5 rounded-sm bg-current" />
      {label}
    </span>
  );
}

/** The shell every chart tooltip in this view shares. */
function TooltipCard({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cx('rounded-lg border border-border bg-surface-2 px-3.5 py-2.5 text-[12px] shadow-pop', className)}>
      {children}
    </div>
  );
}

function roundForDisplay(value: number): number {
  return Math.round(value * 100) / 100;
}

function DailyTooltip({ active, payload, label }: { active?: boolean; payload?: { payload: { dailyIn: number; dailyOut: number; moneyIn: number; moneyOut: number; net: number; events: MonthObligation[] } }[]; label?: string }) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  const incoming = row.events.filter((event) => event.direction === 'in');
  const outgoing = row.events.filter((event) => event.direction === 'out');
  const items = (events: MonthObligation[], className: string, sign: string) => events.map((event) => (
    <div key={event.key} className="mt-1 flex justify-between gap-3">
      <span className="text-text">
        {event.name}
        <span className="text-[10px] text-muted"> · {event.paid ? (event.kind === 'income' ? 'received' : 'paid') : 'expected'} · {event.detail}</span>
      </span>
      <strong className={cx('whitespace-nowrap', className)}>{sign}{formatMoney(event.amount)}</strong>
    </div>
  ));
  return (
    <TooltipCard className="min-w-[280px] max-w-[460px]">
      <strong>Day {label}</strong>
      {incoming.length > 0 && (
        <div className="mt-2">
          <p className="font-bold text-income">Money in · +{formatMoney(row.dailyIn)}</p>
          {items(incoming, 'text-income', '+')}
        </div>
      )}
      {outgoing.length > 0 && (
        <div className="mt-2">
          <p className="font-bold text-expense">Money out · −{formatMoney(row.dailyOut)}</p>
          {items(outgoing, 'text-expense', '−')}
        </div>
      )}
      {row.events.length === 0 && <p className="mt-1.5 text-muted">No activity scheduled.</p>}
      <p className="mt-1.5 text-muted">Cumulative net: {formatSignedMoney(row.net)}</p>
    </TooltipCard>
  );
}

function Event({ event }: { event: MonthObligation }) {
  return (
    <div
      title={`${event.name} · ${event.detail} · ${formatMoney(event.amount)}`}
      className={cx(
        'min-w-0 rounded-md border-l-[3px] bg-bg px-1.5 py-1',
        KIND_RAIL[event.kind],
        event.paid && 'opacity-55',
      )}
    >
      <div className="flex min-w-0 items-baseline justify-between gap-1">
        <strong className="min-w-0 flex-1 truncate text-[10.5px]">{event.name}</strong>
        <span className={cx(
          'whitespace-nowrap text-[10px]',
          event.direction === 'in' ? 'text-income' : 'text-expense',
          event.paid && 'line-through',
        )}>
          {event.direction === 'in' ? '+' : '−'}{formatMoney(event.amount, { whole: true })}
        </span>
      </div>
      <div className="truncate text-[9.5px] text-muted">
        {!event.dateSpecified ? 'Date not set · ' : ''}{event.paid ? `${event.kind === 'income' ? 'Received' : 'Paid'} · ` : ''}{event.detail}
      </div>
    </div>
  );
}

export default function MonthlyBreakdown({ breakdown, month, onMonthChange, initialView }: Props) {
  const [view, setView] = useState<'daily' | 'calendar' | 'liquidity'>(initialView);
  const [liquidityKey, setLiquidityKey] = useState('total');
  const [accountScope, setAccountScope] = useState('all');
  const firstWeekday = new Date(breakdown.year, breakdown.month, 1).getDay();
  const cells = [...Array(firstWeekday).fill(null), ...Array.from({ length: breakdown.days }, (_, index) => index + 1)];
  while (cells.length % 7) cells.push(null);
  const today = new Date();
  const isCurrentMonth = today.getFullYear() === breakdown.year && today.getMonth() === breakdown.month;
  const accountOptions = breakdown.liquidity.filter((item) => item.kind === 'account');

  const eventForScope = (event: MonthObligation): MonthObligation | null => {
    if (accountScope === 'all') return event;
    const changes = event.liquidityChanges.filter((change) => (
      change.kind === 'account' && (accountScope === 'accounts' || change.key === accountScope)
    ));
    if (!changes.length) return null;
    const amount = roundForDisplay(changes.reduce((sum, change) => sum + Math.abs(change.amount), 0));
    if (amount <= 0.005) return null;
    const accounts = [...new Set(changes.map((change) => change.name))];
    const direction = changes.reduce((sum, change) => sum + change.amount, 0) >= 0 ? 'in' : 'out';
    return { ...event, direction, amount, detail: `${direction === 'in' ? 'to' : 'from'} ${accounts.join(' + ')}` };
  };

  const scopedDaily = breakdown.daily.map((point) => {
    const events = point.events.map(eventForScope).filter((event): event is MonthObligation => !!event);
    const dailyIn = roundForDisplay(events.filter((event) => event.direction === 'in').reduce((sum, event) => sum + event.amount, 0));
    const dailyOut = roundForDisplay(events.filter((event) => event.direction === 'out').reduce((sum, event) => sum + event.amount, 0));
    return { ...point, events, dailyIn, dailyOut };
  }).reduce<typeof breakdown.daily>((days, point) => {
    const previous = days[days.length - 1];
    const moneyIn = roundForDisplay((previous?.moneyIn ?? 0) + point.dailyIn);
    const moneyOut = roundForDisplay((previous?.moneyOut ?? 0) + point.dailyOut);
    days.push({ ...point, moneyIn, moneyOut, net: roundForDisplay(moneyIn - moneyOut) });
    return days;
  }, []);
  const scopedEvents = scopedDaily.flatMap((point) => point.events);
  const scopedTotalIn = scopedDaily[scopedDaily.length - 1]?.moneyIn ?? 0;
  const scopedTotalOut = scopedDaily[scopedDaily.length - 1]?.moneyOut ?? 0;
  const scopedNet = roundForDisplay(scopedTotalIn - scopedTotalOut);

  const card = (label: string, value: string, className: string) => (
    <div className="min-w-[130px] rounded-control border border-border bg-bg px-3.5 py-2.5">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-muted">{label}</div>
      <div className={cx('mt-0.5 text-lg font-bold tabular-nums', className)}>{value}</div>
    </div>
  );

  return (
    <Panel className="p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-base font-semibold tracking-tight">Monthly Obligations</h2>
          <p className="mt-0.5 text-[13px] text-muted">
            Completed and expected inflows and obligations across {breakdown.label}
          </p>
        </div>
        <MonthControl month={month} onMonthChange={onMonthChange} />
      </div>

      <div className="mt-4 flex flex-wrap items-end gap-2">
        {card('Money in', formatMoney(scopedTotalIn, { whole: true }), 'text-income')}
        {card('Money out', formatMoney(scopedTotalOut, { whole: true }), 'text-expense')}
        {card('Net', formatSignedMoney(scopedNet, { whole: true }), scopedNet >= 0 ? 'text-income' : 'text-expense')}
        <div className="ml-auto flex flex-wrap items-end justify-end gap-2.5">
          {view !== 'liquidity' && (
            <label className="flex flex-col gap-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted">Bank account</span>
              <select
                value={accountScope}
                onChange={(event) => setAccountScope(event.target.value)}
                className="min-h-9 min-w-[220px] py-1.5"
              >
                <option value="all">All obligations</option>
                <option value="accounts">All cash accounts</option>
                {accountOptions.map((option) => <option key={option.key} value={option.key}>{option.name}</option>)}
              </select>
            </label>
          )}
          <Segmented
            ariaLabel="Month view"
            options={[
              { id: 'daily', label: 'Daily chart' },
              { id: 'calendar', label: 'Calendar' },
              { id: 'liquidity', label: 'Liquidity' },
            ]}
            value={view}
            onChange={setView}
          />
        </div>
      </div>

      {view === 'daily' ? (
        <div className="mt-5">
          <ResponsiveContainer width="100%" height={390}>
            <LineChart data={scopedDaily} margin={{ top: 8, right: 16, left: 8, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
              <XAxis dataKey="label" interval={0} tick={{ fill: 'var(--color-text-muted)', fontSize: 9 }} tickLine={false} axisLine={{ stroke: 'var(--color-border)' }} />
              <YAxis tickFormatter={formatCompactMoney} tick={{ fill: 'var(--color-text-muted)', fontSize: 11 }} tickLine={false} axisLine={false} width={64} />
              {isCurrentMonth && <ReferenceLine x={String(today.getDate())} stroke="var(--color-text-muted)" strokeDasharray="4 4" label={{ value: 'Today', fill: 'var(--color-text-muted)', fontSize: 10, position: 'insideTopRight' }} />}
              <Tooltip content={<DailyTooltip />} />
              <Line type="stepAfter" dataKey="moneyIn" name="Cumulative money in" stroke="var(--color-income)" strokeWidth={2} dot={false} />
              <Line type="stepAfter" dataKey="moneyOut" name="Cumulative money out" stroke="var(--color-expense)" strokeWidth={2} dot={false} />
              <Line type="stepAfter" dataKey="net" name="Cumulative net" stroke="var(--color-text)" strokeWidth={3} dot={false} />
            </LineChart>
          </ResponsiveContainer>
          <div className="flex flex-wrap justify-center gap-4 text-[11px] text-muted">
            <LegendSwatch className="text-income" label="Money in" />
            <LegendSwatch className="text-expense" label="Money out" />
            <LegendSwatch className="text-text" label="Net" />
          </div>
        </div>
      ) : view === 'calendar' ? (
        <div className="mt-5 w-full">
          <div className="mb-1.5 grid grid-cols-7 gap-1.5">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
              <div key={day} className="min-w-0 text-center text-[10px] font-bold uppercase text-muted">{day}</div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1.5">
            {cells.map((day, index) => {
              const events = day ? scopedEvents.filter((event) => event.day === day) : [];
              const current = !!day && isCurrentMonth && day === today.getDate();
              return (
                <div
                  key={index}
                  className={cx(
                    'min-h-[132px] min-w-0 overflow-hidden rounded-lg border p-1.5',
                    day ? 'bg-surface-2' : 'bg-transparent',
                    current ? 'border-primary' : 'border-border',
                  )}
                >
                  {day && (
                    <div className={cx('mb-1.5 text-[11px] font-bold', current ? 'text-primary' : 'text-muted')}>
                      {day}
                    </div>
                  )}
                  <div className="flex min-w-0 flex-col gap-1">
                    {events.map((event) => <Event key={event.key} event={event} />)}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <LiquidityChart breakdown={breakdown} selected={liquidityKey} onSelect={setLiquidityKey} />
      )}
    </Panel>
  );
}

function LiquidityChart({ breakdown, selected, onSelect }: { breakdown: MonthBreakdown; selected: string; onSelect: (key: string) => void }) {
  const series = breakdown.liquidity.find((item) => item.key === selected) ?? breakdown.liquidity[0];
  const data = breakdown.daily.map((point, index) => ({ ...point, liquidity: series?.values[index] ?? 0 }));
  const finalValue = series?.values[series.values.length - 1] ?? 0;
  const today = new Date();
  const todayLabel = today.getFullYear() === breakdown.year && today.getMonth() === breakdown.month ? String(today.getDate()) : null;

  return (
    <div className="mt-5">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold tracking-tight">Available to Play With</h3>
          <p className="mt-0.5 text-[11.5px] text-muted">
            Reconstructed completed activity through today, followed by expected cash and card-credit changes.
          </p>
        </div>
        <label className="flex flex-col gap-1">
          <span className="text-[10px] font-bold uppercase tracking-wider text-muted">Liquidity source</span>
          <select value={selected} onChange={(event) => onSelect(event.target.value)} className="min-w-[220px]">
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
      <div className={cx('mb-1.5 text-xl font-bold tabular-nums', finalValue > 0 ? 'text-income' : 'text-expense')}>
        {formatMoney(finalValue)} <span className="text-[11px] font-medium text-muted">available at month end</span>
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
  const effects = row.events.flatMap((event) => event.liquidityChanges
    .filter((change) => seriesKey === 'total' || (seriesKey === 'accounts' && change.kind === 'account') || change.key === seriesKey)
    .map((change) => ({ event, change })));
  const grouped = (direction: 'to' | 'from') => {
    const map = new Map<string, { name: string; kind: 'account' | 'card'; total: number; items: { key: string; name: string; amount: number }[] }>();
    for (const { event, change } of effects) {
      if ((direction === 'to') !== (change.amount > 0.005)) continue;
      const group = map.get(change.key) ?? { name: change.name, kind: change.kind, total: 0, items: [] };
      group.total += change.amount;
      group.items.push({ key: event.key, name: event.name, amount: change.amount });
      map.set(change.key, group);
    }
    return [...map.values()];
  };
  const to = grouped('to');
  const from = grouped('from');
  const section = (title: string, groups: ReturnType<typeof grouped>, className: string) => groups.length > 0 && (
    <div className="mt-2">
      <p className={cx('text-[10px] font-bold uppercase tracking-wider', className)}>{title}</p>
      {groups.map((group) => (
        <div key={`${title}:${group.name}`} className="mt-1.5">
          <div className="flex justify-between gap-3">
            <strong className="text-[11.5px]">{group.name}</strong>
            <strong className={cx('whitespace-nowrap', className)}>{formatSignedMoney(group.total)}</strong>
          </div>
          <div className="ml-[3px] border-l border-border pl-2">
            {group.items.map((item, index) => (
              <div key={`${item.key}:${index}`} className="mt-0.5 flex justify-between gap-3 text-[10.5px] text-muted">
                <span>{item.name}</span>
                <span className="whitespace-nowrap">{formatSignedMoney(item.amount)}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
  return (
    <TooltipCard className="min-w-[240px] max-w-[420px]">
      <strong>Day {label} · {name}</strong>
      <p className="mt-1.5 font-bold text-primary">{formatMoney(row.liquidity)} available</p>
      {effects.length > 0 && (
        <div className="mt-2">
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted">Day’s balance changes</p>
          {section('To', to, 'text-income')}
          {section('From', from, 'text-expense')}
        </div>
      )}
    </TooltipCard>
  );
}
