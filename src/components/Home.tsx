import { Suspense, lazy } from 'react';
import type { Breakdown } from '../lib/forecast';
import type { MonthBreakdown } from '../lib/monthlyBreakdown';
import type { Account, Debt, NetWorthPoint } from '../types';
import type { DebtPlan } from '../lib/debt';
import type { Goal } from '../types';
import { STATUS_LABEL, goalBoard, type GoalInputs, type GoalProgress } from '../lib/goals';
import {
  buildBalanceSheet, findCashLow, findRunwayRisk, monthLabelAt, monthProgress, netWorthTrend,
  payoffOrder, totalsFor, upcomingEvents, whenLabel,
  type BalanceLine, type PayoffStep, type UpcomingEvent, type UpcomingTotals,
} from '../lib/home';
import { HOME_LAYOUTS, type HomeLayout } from '../lib/homeLayout';
import { formatMoney } from '../lib/format';
import { Button, Card, Segmented, cx } from '../ui';

const RunwayChart = lazy(() => import('./RunwayChart'));

interface Props {
  layout: HomeLayout;
  onLayoutChange: (layout: HomeLayout) => void;
  totalCash: number;
  netWorth: NetWorthPoint[];
  accountSeries: Breakdown;
  accounts: Account[];
  debts: Debt[];
  /** The combined payoff plan, for the payoff layout. */
  debtPlan: DebtPlan;
  goals: Goal[];
  /** The series each goal is measured against. */
  goalInputs: GoalInputs;
  onGoToGoals: () => void;
  /** This month and the next, for the upcoming list. */
  monthBreakdowns: MonthBreakdown[];
  onGoToPlan: () => void;
  onGoToProjections: () => void;
  onGoToAccounts: () => void;
  onGoToDebts: () => void;
}

export default function Home({
  layout, onLayoutChange, totalCash, netWorth, accountSeries, accounts, debts, debtPlan,
  goals, goalInputs, monthBreakdowns, onGoToPlan, onGoToProjections, onGoToAccounts, onGoToDebts,
  onGoToGoals,
}: Props) {
  const risk = findRunwayRisk(accountSeries);
  const low = findCashLow(accountSeries);
  const events = upcomingEvents(monthBreakdowns, 30);
  const totals = totalsFor(events);

  const now = netWorth[0];
  const chartData = netWorth.slice(0, 12).map((p, i) => ({
    label: p.label,
    cash: accountSeries.total[i] ?? p.cash,
    debt: p.debt,
    netWorth: p.netWorth,
  }));

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="grid flex-1 gap-4 sm:grid-cols-3">
          <Stat label="Net worth" value={now?.netWorth ?? 0} tone={(now?.netWorth ?? 0) >= 0 ? 'pos' : 'neg'} />
          <Stat label="Cash on hand" value={totalCash} tone="plain" />
          <Stat label="Total debt" value={now?.debt ?? 0} tone="neg" />
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[12.5px] text-muted">
          {HOME_LAYOUTS.find((l) => l.id === layout)?.description}
        </p>
        <Segmented
          ariaLabel="Home layout"
          options={HOME_LAYOUTS.map((l) => ({ id: l.id, label: l.label, title: l.description }))}
          value={layout}
          onChange={onLayoutChange}
        />
      </div>

      {layout === 'balance' ? (
        <BalanceLayout
          accounts={accounts}
          debts={debts}
          netWorth={netWorth}
          chartData={chartData}
          lowIndex={low?.monthIndex}
          events={events}
          totals={totals}
          onGoToAccounts={onGoToAccounts}
          onGoToDebts={onGoToDebts}
          onGoToProjections={onGoToProjections}
        />
      ) : layout === 'month' ? (
        <MonthLayout
          month={monthBreakdowns[0]}
          chartData={chartData}
          lowIndex={low?.monthIndex}
          events={events}
          totals={totals}
          onGoToPlan={onGoToPlan}
        />
      ) : layout === 'goal' ? (
        <GoalLayout
          goals={goals}
          inputs={goalInputs}
          chartData={chartData}
          lowIndex={low?.monthIndex}
          events={events}
          totals={totals}
          onGoToGoals={onGoToGoals}
        />
      ) : layout === 'payoff' ? (
        <PayoffLayout
          debts={debts}
          plan={debtPlan}
          chartData={chartData}
          lowIndex={low?.monthIndex}
          events={events}
          totals={totals}
          onGoToDebts={onGoToDebts}
        />
      ) : (
        <RunwayLayout
          risk={risk}
          low={low}
          netWorth={netWorth}
          chartData={chartData}
          events={events}
          totals={totals}
          onGoToPlan={onGoToPlan}
          onGoToProjections={onGoToProjections}
        />
      )}
    </div>
  );
}

type ChartPoint = { label: string; cash: number; debt: number; netWorth: number };

/* ------------------------------ Runway first ----------------------------- */

function RunwayLayout({
  risk, low, netWorth, chartData, events, totals, onGoToPlan, onGoToProjections,
}: {
  risk: ReturnType<typeof findRunwayRisk>;
  low: ReturnType<typeof findCashLow>;
  netWorth: NetWorthPoint[];
  chartData: ChartPoint[];
  events: UpcomingEvent[];
  totals: UpcomingTotals;
  onGoToPlan: () => void;
  onGoToProjections: () => void;
}) {
  const horizon = netWorth[Math.min(11, netWorth.length - 1)];
  return (
    <>
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
        <TrajectoryCard
          title="The next 12 months"
          note={horizon && `Net worth ${formatMoney(horizon.netWorth, { whole: true })} by ${horizon.label}`}
          data={chartData}
          lowIndex={low?.monthIndex}
        />
        <UpcomingCard events={events} totals={totals} />
      </div>
    </>
  );
}

/* --------------------------- Balance sheet first -------------------------- */

function BalanceLayout({
  accounts, debts, netWorth, chartData, lowIndex, events, totals,
  onGoToAccounts, onGoToDebts, onGoToProjections,
}: {
  accounts: Account[];
  debts: Debt[];
  netWorth: NetWorthPoint[];
  chartData: ChartPoint[];
  lowIndex?: number;
  events: UpcomingEvent[];
  totals: UpcomingTotals;
  onGoToAccounts: () => void;
  onGoToDebts: () => void;
  onGoToProjections: () => void;
}) {
  const sheet = buildBalanceSheet(accounts, debts);
  const trend = netWorthTrend(netWorth);

  return (
    <>
      {/* Where it's heading. Deliberately not a second net-worth total: the
          headline figure above is the one net worth on this screen, and the two
          sides below are today's balances, which are a different basis. */}
      <Card className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-wider text-muted">Where this is heading</p>
            {trend && trend.monthsAhead > 0 ? (
              <>
                <p className="mt-1.5 text-[15px] font-semibold">
                  Net worth {trend.change >= 0 ? 'climbs' : 'falls'}{' '}
                  <span className={trend.change >= 0 ? 'text-income' : 'text-expense'}>
                    {formatMoney(Math.abs(trend.change), { whole: true })}
                  </span>
                  {' '}to {formatMoney(trend.to, { whole: true })} by {trend.toLabel}.
                </p>
                <p className="mt-1 text-[13px] text-muted">
                  Over the next {trend.monthsAhead} month{trend.monthsAhead === 1 ? '' : 's'}, on the current plan.
                </p>
              </>
            ) : (
              <p className="mt-1.5 text-[13px] text-muted">
                Add income, expenses or debts to project a trajectory.
              </p>
            )}
          </div>
          <Button variant="ghost" onClick={onGoToProjections}>See projections</Button>
        </div>
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        <SideCard
          title="Where the money is"
          subtitle="Balances today"
          total={sheet.totalCash}
          tone="pos"
          lines={sheet.holdings}
          emptyLabel="No accounts yet."
          actionLabel="Accounts"
          onAction={onGoToAccounts}
        />
        <SideCard
          title="What's owed"
          subtitle="Balances today"
          total={sheet.totalDebt}
          tone="neg"
          lines={sheet.liabilities}
          emptyLabel="No debts tracked."
          actionLabel="Debts"
          onAction={onGoToDebts}
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_380px]">
        <TrajectoryCard title="Cash and debt, next 12 months" data={chartData} lowIndex={lowIndex} />
        <UpcomingCard events={events} totals={totals} />
      </div>
    </>
  );
}

/** One side of the balance sheet, each line showing its share of the whole. */
function SideCard({
  title, subtitle, total, tone, lines, emptyLabel, actionLabel, onAction,
}: {
  title: string;
  subtitle: string;
  total: number;
  tone: 'pos' | 'neg';
  lines: BalanceLine[];
  emptyLabel: string;
  actionLabel: string;
  onAction: () => void;
}) {
  const bar = tone === 'pos' ? 'bg-net-pos' : 'bg-expense';
  return (
    <Card className="flex flex-col p-5">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-[15px] font-semibold tracking-tight">{title}</h2>
          <p className="text-[11.5px] text-muted">{subtitle}</p>
        </div>
        <span className={cx('text-[15px] font-bold tabular-nums', tone === 'pos' ? 'text-text' : 'text-expense')}>
          {formatMoney(total, { whole: true })}
        </span>
      </div>

      {lines.length === 0 ? (
        <p className="py-6 text-center text-[13px] text-muted">{emptyLabel}</p>
      ) : (
        <ul className="flex flex-col gap-2.5">
          {lines.map((line) => (
            <li key={line.id}>
              <div className="flex items-baseline justify-between gap-3">
                <span className="min-w-0 flex-1 truncate text-[13px]">
                  {line.name}
                  {line.overLimit && (
                    <span className="ml-1.5 text-[11px] font-bold uppercase text-expense">over limit</span>
                  )}
                </span>
                <span className="shrink-0 text-[13px] font-semibold tabular-nums">
                  {formatMoney(line.amount, { whole: true })}
                </span>
              </div>
              <div className="mt-1 h-1 overflow-hidden rounded-full bg-surface-2">
                {/* A proportion, so the width has to be computed. */}
                <div className={cx('h-full rounded-full', bar)} style={{ width: `${Math.round(line.share * 100)}%` }} />
              </div>
            </li>
          ))}
        </ul>
      )}

      <Button variant="ghost" size="sm" className="mt-4 self-start" onClick={onAction}>
        {actionLabel}
      </Button>
    </Card>
  );
}


/* ------------------------------ This month ------------------------------- */

function MonthLayout({
  month, chartData, lowIndex, events, totals, onGoToPlan,
}: {
  month?: MonthBreakdown;
  chartData: ChartPoint[];
  lowIndex?: number;
  events: UpcomingEvent[];
  totals: UpcomingTotals;
  onGoToPlan: () => void;
}) {
  if (!month) {
    return (
      <Card className="p-5">
        <p className="text-[13px] text-muted">Nothing scheduled this month yet.</p>
      </Card>
    );
  }
  const progress = monthProgress(month);
  const left = progress.expectedOut;

  return (
    <>
      <Card className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-wider text-muted">
              {month.label} · day {progress.dayOfMonth} of {progress.days}
            </p>
            <p className="mt-1.5 text-[15px] font-semibold">
              {left > 0.005 ? (
                <>
                  <span className="text-expense">{formatMoney(left, { whole: true })}</span> still to pay
                  {progress.expectedIn > 0.005 && (
                    <>, <span className="text-income">{formatMoney(progress.expectedIn, { whole: true })}</span> still to come in</>
                  )}.
                </>
              ) : (
                <>Everything scheduled this month is settled.</>
              )}
            </p>
            <p className="mt-1 text-[13px] text-muted">
              {formatMoney(progress.paidOut, { whole: true })} of{' '}
              {formatMoney(progress.totalOut, { whole: true })} paid so far.
            </p>
          </div>
          <Button variant="secondary" onClick={onGoToPlan}>Open plan</Button>
        </div>

        <div className="mt-4 flex flex-col gap-2">
          <Meter label="Money out" done={progress.paidOut} total={progress.totalOut} barClass="bg-expense" />
          <Meter label="Money in" done={progress.receivedIn} total={progress.totalIn} barClass="bg-income" />
        </div>
      </Card>

      <div className="grid gap-5 lg:grid-cols-[1fr_380px]">
        <Card className="flex flex-col p-5">
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-[15px] font-semibold tracking-tight">Left to pay this month</h2>
            <span className="text-[13px] font-semibold text-expense">
              {formatMoney(left, { whole: true })}
            </span>
          </div>
          {progress.remaining.length === 0 ? (
            <p className="py-6 text-center text-[13px] text-muted">Nothing outstanding.</p>
          ) : (
            <ul className="-mx-2 flex max-h-[320px] flex-col overflow-y-auto">
              {progress.remaining.map((item) => (
                <li key={item.key} className="flex items-baseline gap-3 rounded-control px-2 py-1.5 hover:bg-surface-2">
                  <span className="w-[42px] shrink-0 text-[11.5px] text-muted">
                    {item.dateSpecified ? `Day ${item.day}` : '—'}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[13px]" title={item.detail}>{item.name}</span>
                  <span className="shrink-0 text-[13px] font-semibold tabular-nums">
                    {formatMoney(item.amount, { whole: true })}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <UpcomingCard events={events} totals={totals} />
      </div>

      <TrajectoryCard title="Cash and debt, next 12 months" data={chartData} lowIndex={lowIndex} />
    </>
  );
}

/** A labelled progress bar. `total` of 0 renders an empty track, not a full one. */
function Meter({ label, done, total, barClass }: { label: string; done: number; total: number; barClass: string }) {
  const pct = total > 0.005 ? Math.min(100, Math.round((done / total) * 100)) : 0;
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3 text-[12px]">
        <span className="text-muted">{label}</span>
        <span className="tabular-nums text-muted">
          {formatMoney(done, { whole: true })} / {formatMoney(total, { whole: true })}
        </span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-2">
        {/* A proportion, so the width has to be computed. */}
        <div className={cx('h-full rounded-full', barClass)} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

/* ------------------------------ Debt payoff ------------------------------ */

function PayoffLayout({
  debts, plan, chartData, lowIndex, events, totals, onGoToDebts,
}: {
  debts: Debt[];
  plan: DebtPlan;
  chartData: ChartPoint[];
  lowIndex?: number;
  events: UpcomingEvent[];
  totals: UpcomingTotals;
  onGoToDebts: () => void;
}) {
  const steps = payoffOrder(debts, plan.payoffMonthByDebt);
  const next = steps.find((s) => s.monthIndex != null) ?? null;
  const stuck = steps.filter((s) => s.monthIndex == null);
  const freeLabel = plan.debtFreeMonthIndex != null ? monthLabelAt(plan.debtFreeMonthIndex) : null;

  return (
    <>
      <Card className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-wider text-muted">Debt-free</p>
            {debts.length === 0 ? (
              <p className="mt-1.5 text-[15px] font-semibold text-income">No debts tracked.</p>
            ) : freeLabel ? (
              <>
                <p className="mt-1.5 text-3xl font-semibold tracking-tight">{freeLabel}</p>
                <p className="mt-1 text-[13px] text-muted">
                  {plan.debtFreeMonthIndex} month{plan.debtFreeMonthIndex === 1 ? '' : 's'} away
                  {plan.totalInterest > 1 && <> · {formatMoney(plan.totalInterest, { whole: true })} interest between now and then</>}
                  {next && <> · {next.name} clears first, in {next.label}</>}.
                </p>
              </>
            ) : (
              <>
                <p className="mt-1.5 text-[15px] font-semibold text-expense">Not within the forecast.</p>
                <p className="mt-1 text-[13px] text-muted">
                  {stuck.length > 0
                    ? `${stuck.map((s) => s.name).join(', ')} ${stuck.length === 1 ? 'does' : 'do'} not clear — the payment may not cover the interest.`
                    : 'No debt clears inside the projected horizon.'}
                </p>
              </>
            )}
          </div>
          <Button variant="secondary" onClick={onGoToDebts}>Open debts</Button>
        </div>
      </Card>

      <div className="grid gap-5 lg:grid-cols-[1fr_380px]">
        <Card className="flex flex-col p-5">
          <h2 className="mb-3 text-[15px] font-semibold tracking-tight">Payoff order</h2>
          {steps.length === 0 ? (
            <p className="py-6 text-center text-[13px] text-muted">Nothing to pay off.</p>
          ) : (
            <ol className="flex flex-col gap-2.5">
              {steps.map((step, i) => <PayoffRow key={step.id} step={step} position={i + 1} />)}
            </ol>
          )}
        </Card>

        <UpcomingCard events={events} totals={totals} />
      </div>

      <TrajectoryCard title="Cash and debt, next 12 months" data={chartData} lowIndex={lowIndex} />
    </>
  );
}

function PayoffRow({ step, position }: { step: PayoffStep; position: number }) {
  const never = step.monthIndex == null;
  return (
    <li>
      <div className="flex items-baseline justify-between gap-3">
        <span className="min-w-0 flex-1 truncate text-[13px]">
          <span className="mr-1.5 text-[11px] font-bold text-faint">{position}</span>
          {step.name}
        </span>
        <span className={cx('shrink-0 text-[12.5px] font-semibold', never ? 'text-expense' : 'text-muted')}>
          {never ? 'never clears' : step.label}
        </span>
        <span className="w-[76px] shrink-0 text-right text-[13px] font-semibold tabular-nums">
          {formatMoney(step.balance, { whole: true })}
        </span>
      </div>
      <div className="mt-1 h-1 overflow-hidden rounded-full bg-surface-2">
        {/* A proportion, so the width has to be computed. */}
        <div
          className={cx('h-full rounded-full', never ? 'bg-expense' : 'bg-net-neg')}
          style={{ width: `${Math.round(step.share * 100)}%` }}
        />
      </div>
    </li>
  );
}


/* ----------------------------- Goal progress ----------------------------- */

const GOAL_TONE: Record<GoalProgress['status'], string> = {
  met: 'text-income',
  'on-track': 'text-primary',
  ahead: 'text-income',
  behind: 'text-warning',
  'off-track': 'text-expense',
  untracked: 'text-muted',
};

const GOAL_BAR: Record<GoalProgress['status'], string> = {
  met: 'bg-income',
  'on-track': 'bg-primary',
  ahead: 'bg-income',
  behind: 'bg-warning',
  'off-track': 'bg-expense',
  untracked: 'bg-border-strong',
};

function GoalLayout({
  goals, inputs, chartData, lowIndex, events, totals, onGoToGoals,
}: {
  goals: Goal[];
  inputs: GoalInputs;
  chartData: ChartPoint[];
  lowIndex?: number;
  events: UpcomingEvent[];
  totals: UpcomingTotals;
  onGoToGoals: () => void;
}) {
  const board = goalBoard(goals, inputs);
  const met = board.filter((p) => p.status === 'met').length;
  const atRisk = board.filter((p) => p.status === 'behind' || p.status === 'off-track');
  const lead = atRisk[0] ?? board.find((p) => p.status !== 'met') ?? board[0] ?? null;

  return (
    <>
      <Card className={cx('p-5', atRisk.length > 0 && 'border-warning/45 bg-warning/8')}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            {goals.length === 0 ? (
              <>
                <p className="text-[11px] font-bold uppercase tracking-wider text-muted">Goals</p>
                <p className="mt-1.5 text-[15px] font-semibold">No goals set.</p>
                <p className="mt-1 text-[13px] text-muted">
                  Goals are optional — everything else works without them. Add one and this
                  screen will say when the current plan gets you there.
                </p>
              </>
            ) : atRisk.length > 0 ? (
              <>
                <p className="text-[11px] font-bold uppercase tracking-wider text-warning">Needs attention</p>
                <p className="mt-1.5 text-[15px] font-semibold">
                  {atRisk.length === 1
                    ? <>“{atRisk[0].goal.name}” is {STATUS_LABEL[atRisk[0].status].toLowerCase()}.</>
                    : <>{atRisk.length} goals are off their plan.</>}
                </p>
                {lead?.projectedLabel && (
                  <p className="mt-1 text-[13px] text-muted">
                    The current plan reaches “{lead.goal.name}” in {lead.projectedLabel}
                    {lead.slackMonths != null && lead.slackMonths < 0 && (
                      <>, {Math.abs(lead.slackMonths)} month{Math.abs(lead.slackMonths) === 1 ? '' : 's'} after the date you set</>
                    )}.
                  </p>
                )}
              </>
            ) : (
              <>
                <p className="text-[11px] font-bold uppercase tracking-wider text-income">On plan</p>
                <p className="mt-1.5 text-[15px] font-semibold">
                  {met === goals.length
                    ? <>Every goal reached.</>
                    : <>{met} of {goals.length} reached, and the rest are on track.</>}
                </p>
                {lead?.projectedLabel && (
                  <p className="mt-1 text-[13px] text-muted">
                    Next up: “{lead.goal.name}”, around {lead.projectedLabel}.
                  </p>
                )}
              </>
            )}
          </div>
          <Button variant="secondary" onClick={onGoToGoals}>
            {goals.length === 0 ? 'Add a goal' : 'Open goals'}
          </Button>
        </div>
      </Card>

      {board.length > 0 && (
        <Card className="p-5">
          <h2 className="mb-3 text-[15px] font-semibold tracking-tight">Progress</h2>
          <ul className="flex flex-col gap-3">
            {board.map((progress) => (
              <li key={progress.goal.id}>
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="min-w-0 flex-1 truncate text-[13px] font-medium">{progress.goal.name}</span>
                  <span className={cx('shrink-0 text-[12px] font-semibold', GOAL_TONE[progress.status])}>
                    {STATUS_LABEL[progress.status]}
                  </span>
                  <span className="w-[120px] shrink-0 text-right text-[12px] text-muted">
                    {progress.projectedLabel ?? (progress.status === 'met' ? 'done' : '—')}
                  </span>
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-2">
                  {/* A proportion, so the width has to be computed. */}
                  <div
                    className={cx('h-full rounded-full', GOAL_BAR[progress.status])}
                    style={{ width: `${Math.round(progress.fraction * 100)}%` }}
                  />
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <div className="grid gap-5 lg:grid-cols-[1fr_380px]">
        <TrajectoryCard title="Cash and debt, next 12 months" data={chartData} lowIndex={lowIndex} />
        <UpcomingCard events={events} totals={totals} />
      </div>
    </>
  );
}

/* ----------------------------- Shared pieces ----------------------------- */

function TrajectoryCard({
  title, note, data, lowIndex,
}: {
  title: string;
  note?: React.ReactNode;
  data: ChartPoint[];
  lowIndex?: number;
}) {
  return (
    <Card className="flex flex-col p-5">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-[15px] font-semibold tracking-tight">{title}</h2>
        {note && <p className="text-[12.5px] text-muted">{note}</p>}
      </div>
      <Suspense fallback={<div className="grid h-[240px] place-items-center text-[13px] text-muted">Loading chart…</div>}>
        <RunwayChart data={data} lowIndex={lowIndex} />
      </Suspense>
      <div className="mt-3 flex items-center gap-4 text-[12px] text-muted">
        <Legend className="bg-net-pos" label="Cash" />
        <Legend className="bg-expense" label="Debt" />
      </div>
    </Card>
  );
}

function UpcomingCard({ events, totals }: { events: UpcomingEvent[]; totals: UpcomingTotals }) {
  return (
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

function Legend({ className, label }: { className: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={cx('h-0.5 w-4 rounded-full', className)} />
      {label}
    </span>
  );
}
