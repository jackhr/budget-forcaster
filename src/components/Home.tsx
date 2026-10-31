import { Suspense, lazy } from 'react';
import type { Breakdown } from '../lib/forecast';
import type { MonthBreakdown } from '../lib/monthlyBreakdown';
import type { NetWorthPoint } from '../types';
import { findCashLow, findRunwayRisk, totalsFor, upcomingEvents, whenLabel } from '../lib/home';
import { formatMoney } from '../lib/format';
import { Button, Card, cx } from '../ui';

const RunwayChart = lazy(() => import('./RunwayChart'));

interface Props {
  totalCash: number;
  netWorth: NetWorthPoint[];
  accountSeries: Breakdown;
  /** This month and the next, for the upcoming list. */
  monthBreakdowns: MonthBreakdown[];
  onGoToPlan: () => void;
  onGoToProjections: () => void;
}

export default function Home({
  totalCash, netWorth, accountSeries, monthBreakdowns, onGoToPlan, onGoToProjections,
}: Props) {
  const risk = findRunwayRisk(accountSeries);
  const low = findCashLow(accountSeries);
  const events = upcomingEvents(monthBreakdowns, 30);
  const totals = totalsFor(events);

  const now = netWorth[0];
  const horizon = netWorth[Math.min(11, netWorth.length - 1)];
  const chartData = netWorth.slice(0, 12).map((p, i) => ({
    label: p.label,
    cash: accountSeries.total[i] ?? p.cash,
    debt: p.debt,
    netWorth: p.netWorth,
  }));

  return (
    <div className="flex flex-col gap-5">
      {/* Where you stand */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Net worth" value={now?.netWorth ?? 0} tone={(now?.netWorth ?? 0) >= 0 ? 'pos' : 'neg'} />
        <Stat label="Cash on hand" value={totalCash} tone="plain" />
        <Stat label="Total debt" value={now?.debt ?? 0} tone="neg" />
      </div>

      {/* The one thing worth knowing */}
      {risk ? (
        <Card className="border-expense/45 bg-expense/8 p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-[11px] font-bold uppercase tracking-wider text-expense">Heads up</p>
              <p className="mt-1.5 text-[15px] font-semibold">
                {risk.accountName} is projected to reach{' '}
                <span className="text-expense">{formatMoney(risk.amount)}</span> in {risk.monthLabel}.
              </p>
              <p className="mt-1 text-[13px] text-muted">
                That's {risk.monthIndex === 0 ? 'this month' : `${risk.monthIndex} month${risk.monthIndex === 1 ? '' : 's'} out`}.
                Move a bill, change what funds it, or adjust the payoff plan.
              </p>
            </div>
            <Button variant="secondary" onClick={onGoToPlan}>Open plan</Button>
          </div>
        </Card>
      ) : (
        <Card className="p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-[11px] font-bold uppercase tracking-wider text-income">On track</p>
              <p className="mt-1.5 text-[15px] font-semibold">
                No account is projected to go negative.
              </p>
              {low && (
                <p className="mt-1 text-[13px] text-muted">
                  Cash is lowest in {low.monthLabel}, at {formatMoney(low.amount)}.
                </p>
              )}
            </div>
            <Button variant="ghost" onClick={onGoToProjections}>See projections</Button>
          </div>
        </Card>
      )}

      <div className="grid gap-5 lg:grid-cols-[1fr_380px]">
        {/* The shape of the next year */}
        <Card className="flex flex-col p-5">
          <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-[15px] font-semibold tracking-tight">The next 12 months</h2>
            {horizon && (
              <p className="text-[12.5px] text-muted">
                Net worth {formatMoney(horizon.netWorth, { whole: true })} by {horizon.label}
              </p>
            )}
          </div>
          <Suspense fallback={<div className="grid h-[240px] place-items-center text-[13px] text-muted">Loading chart…</div>}>
            <RunwayChart data={chartData} lowIndex={low?.monthIndex} />
          </Suspense>
          <div className="mt-3 flex items-center gap-4 text-[12px] text-muted">
            <Legend color="var(--color-net-pos)" label="Cash" />
            <Legend color="var(--color-expense)" label="Debt" />
          </div>
        </Card>

        {/* What's actually about to happen */}
        <Card className="flex flex-col p-5">
          <div className="mb-1 flex items-baseline justify-between gap-2">
            <h2 className="text-[15px] font-semibold tracking-tight">Next 30 days</h2>
            <span className={cx('text-[13px] font-semibold', totals.net >= 0 ? 'text-income' : 'text-expense')}>
              {totals.net >= 0 ? '+' : ''}{formatMoney(totals.net, { whole: true })}
            </span>
          </div>
          <p className="mb-3 text-[12px] text-muted">
            {formatMoney(totals.in, { whole: true })} in · {formatMoney(totals.out, { whole: true })} out
          </p>

          {events.length === 0 ? (
            <p className="py-6 text-center text-[13px] text-muted">Nothing scheduled in the next 30 days.</p>
          ) : (
            <ul className="-mx-2 flex max-h-[300px] flex-col overflow-y-auto">
              {events.map((event) => (
                <li key={event.key} className="flex items-baseline gap-3 rounded-control px-2 py-1.5 hover:bg-surface-2">
                  <span className="w-[72px] shrink-0 text-[11.5px] text-muted">{whenLabel(event)}</span>
                  <span className="min-w-0 flex-1 truncate text-[13px]" title={event.detail}>{event.name}</span>
                  <span className={cx('shrink-0 text-[13px] font-semibold tabular-nums', event.direction === 'in' ? 'text-income' : 'text-text')}>
                    {event.direction === 'in' ? '+' : '−'}{formatMoney(event.amount, { whole: true })}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone: 'pos' | 'neg' | 'plain' }) {
  const color = tone === 'pos' ? 'text-income' : tone === 'neg' ? 'text-expense' : 'text-text';
  return (
    <Card className="p-5">
      <p className="text-[11px] font-bold uppercase tracking-wider text-muted">{label}</p>
      <p className={cx('mt-1.5 text-2xl font-semibold tabular-nums tracking-tight', color)}>
        {formatMoney(value, { whole: true })}
      </p>
    </Card>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="h-0.5 w-4 rounded-full" style={{ background: color }} />
      {label}
    </span>
  );
}
