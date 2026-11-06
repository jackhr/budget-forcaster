// Goal progress. Like the rest of src/lib this is pure and takes `now`, so a
// goal's status is testable without rendering anything.
//
// A goal is a destination: an amount to reach, or a debt to clear, optionally
// by a date. Nothing here proposes how to get there — that's the suggestions
// engine, deliberately deferred (ICEBOX I2).
import type { Breakdown } from './forecast';
import type { Bucket, Goal, GoalKind, NetWorthPoint } from '../types';

export const GOAL_KINDS: { id: GoalKind; label: string; description: string }[] = [
  { id: 'savings', label: 'Save up', description: 'Reach an amount in a bucket, one account, or across all your cash.' },
  { id: 'debt_payoff', label: 'Pay off', description: 'Clear one debt, or everything you owe.' },
  { id: 'net_worth', label: 'Net worth', description: 'Reach an overall net worth.' },
];

export type GoalStatus =
  /** Already there. */
  | 'met'
  /** No deadline, and the projection reaches it. */
  | 'on-track'
  /** Deadline set, and the projection reaches it in time. */
  | 'ahead'
  /** Deadline set, and the projection reaches it late. */
  | 'behind'
  /** The projection never reaches it inside the horizon. */
  | 'off-track'
  /** The goal points at an account or debt that no longer exists. */
  | 'untracked';

export interface GoalProgress {
  goal: Goal;
  status: GoalStatus;
  /** Where the thing being tracked stands now. */
  current: number;
  /** Where it needs to get to. Zero for a payoff goal. */
  target: number;
  /** 0–1, clamped. For a payoff goal this counts down the balance. */
  fraction: number;
  /** Month index the projection first meets the goal, or null if it never does. */
  monthIndex: number | null;
  /** "Mar 2028", or null. */
  projectedLabel: string | null;
  /** Months between the projected date and the deadline; negative = late. */
  slackMonths: number | null;
  /**
   * The plan touches the target in this month but doesn't stay there — the
   * money is spent again. Null when it never touches, or when it holds.
   */
  touchesLabel: string | null;
}

export interface GoalInputs {
  /** Per-account cash projection, plus the total. */
  accountSeries: Breakdown;
  /** Net worth per month. */
  netWorth: NetWorthPoint[];
  /** Remaining balance per month, per debt. */
  remainingByDebt: Map<number, number[]>;
  /** Total remaining debt per month. */
  debtRemaining: number[];
  /** Today's balances, for the "current" reading. */
  accounts: { id: number; balance: number }[];
  debts: { id: number; balance: number }[];
  totalCash: number;
  /** Buckets and their projected balances, for goals that track one. */
  buckets?: Bucket[];
  bucketSeries?: Map<number, number[]>;
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

function monthLabel(monthIndex: number, now: Date): string {
  const d = new Date(now.getFullYear(), now.getMonth() + monthIndex, 1);
  return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

/** Whole months from now until a YYYY-MM-DD date. Negative once it's past. */
export function monthsUntil(date: string, now: Date = new Date()): number {
  const [year, month] = date.split('-').map(Number);
  return (year - now.getFullYear()) * 12 + (month - 1 - now.getMonth());
}

/** The first month a series satisfies the goal, or null within the horizon. */
function firstMonthMeeting(values: number[], meets: (v: number) => boolean): number | null {
  for (let m = 0; m < values.length; m++) {
    if (meets(values[m])) return m;
  }
  return null;
}

/**
 * The first month from which the series meets the goal and keeps meeting it
 * through the end of the horizon, or null.
 *
 * Touching a number isn't having it: a balance that reaches $20k the month a
 * bonus lands and is spent back down by spring hasn't saved $20k. The same
 * holds for a debt that's cleared and then charged back up.
 */
function firstMonthHolding(values: number[], meets: (v: number) => boolean): number | null {
  let from: number | null = null;
  for (let m = values.length - 1; m >= 0; m--) {
    if (!meets(values[m])) break;
    from = m;
  }
  return from;
}

/**
 * Where one goal stands, and when the current plan gets there.
 *
 * Returns `untracked` rather than guessing when the goal points at an account
 * or debt that has since been deleted — a goal silently tracking the wrong
 * thing is worse than one that says it needs re-pointing.
 */
export function goalProgress(goal: Goal, inputs: GoalInputs, now: Date = new Date()): GoalProgress {
  const base = {
    goal,
    monthIndex: null as number | null,
    projectedLabel: null as string | null,
    slackMonths: null as number | null,
    touchesLabel: null as string | null,
  };

  let current: number;
  let target: number;
  let series: number[];
  let meets: (v: number) => boolean;

  if (goal.kind === 'debt_payoff') {
    target = 0;
    if (goal.debt_id != null) {
      const debt = inputs.debts.find((d) => d.id === goal.debt_id);
      const remaining = inputs.remainingByDebt.get(goal.debt_id);
      if (!debt || !remaining) {
        return { ...base, status: 'untracked', current: 0, target: 0, fraction: 0 };
      }
      current = debt.balance;
      series = remaining;
    } else {
      current = inputs.debts.reduce((sum, d) => sum + d.balance, 0);
      series = inputs.debtRemaining;
    }
    meets = (v) => v <= 0.005;
  } else if (goal.kind === 'net_worth') {
    target = goal.target_amount ?? 0;
    current = inputs.netWorth[0]?.netWorth ?? 0;
    series = inputs.netWorth.map((p) => p.netWorth);
    meets = (v) => v >= target - 0.005;
  } else {
    target = goal.target_amount ?? 0;
    if (goal.bucket_id != null) {
      const bucket = inputs.buckets?.find((b) => b.id === goal.bucket_id);
      const projected = inputs.bucketSeries?.get(goal.bucket_id);
      if (!bucket || !projected) {
        return { ...base, status: 'untracked', current: 0, target, fraction: 0 };
      }
      current = bucket.balance;
      series = projected;
    } else if (goal.account_id != null) {
      const account = inputs.accounts.find((a) => a.id === goal.account_id);
      const projected = inputs.accountSeries.series.find((s) => s.id === goal.account_id);
      if (!account || !projected) {
        return { ...base, status: 'untracked', current: 0, target, fraction: 0 };
      }
      current = account.balance;
      series = projected.values;
    } else {
      current = inputs.totalCash;
      series = inputs.accountSeries.total;
    }
    meets = (v) => v >= target - 0.005;
  }

  // A payoff goal counts a balance down from where it started; everything else
  // counts up from zero. Without a recorded start there's no baseline, so it
  // reports no progress rather than a made-up number.
  const start = goal.start_amount ?? null;
  const fraction = goal.kind === 'debt_payoff'
    ? (current <= 0.005 ? 1 : (start && start > 0 ? clamp01(1 - current / start) : 0))
    : (target > 0 ? clamp01(current / target) : 0);

  const monthIndex = firstMonthHolding(series, meets);
  // Met means there today and staying there. Today's figure alone isn't
  // enough: an account at target that the plan drains isn't a reached goal.
  if (meets(current) && (monthIndex === 0 || series.length === 0)) {
    return { ...base, status: 'met', current, target, fraction: 1 };
  }

  if (monthIndex == null) {
    const touch = firstMonthMeeting(series, meets);
    return {
      ...base,
      status: 'off-track',
      current,
      target,
      fraction,
      touchesLabel: touch != null ? monthLabel(touch, now) : null,
    };
  }

  const projectedLabel = monthLabel(monthIndex, now);
  if (!goal.target_date) {
    return { ...base, status: 'on-track', current, target, fraction, monthIndex, projectedLabel };
  }

  const slackMonths = monthsUntil(goal.target_date, now) - monthIndex;
  return {
    ...base,
    status: slackMonths >= 0 ? 'ahead' : 'behind',
    current,
    target,
    fraction,
    monthIndex,
    projectedLabel,
    slackMonths,
  };
}

/** Every goal's progress, soonest deadline first, met goals last. */
export function goalBoard(goals: Goal[], inputs: GoalInputs, now: Date = new Date()): GoalProgress[] {
  return goals
    .map((goal) => goalProgress(goal, inputs, now))
    .sort((a, b) => {
      // Finished goals stop competing for attention.
      if ((a.status === 'met') !== (b.status === 'met')) return a.status === 'met' ? 1 : -1;
      // Then whatever is most at risk.
      const rank = (s: GoalStatus) => (s === 'behind' || s === 'off-track' ? 0 : s === 'untracked' ? 2 : 1);
      if (rank(a.status) !== rank(b.status)) return rank(a.status) - rank(b.status);
      // Then by deadline, undated last.
      const deadline = (p: GoalProgress) => (p.goal.target_date ? monthsUntil(p.goal.target_date, now) : Infinity);
      return deadline(a) - deadline(b);
    });
}

export const STATUS_LABEL: Record<GoalStatus, string> = {
  met: 'Reached',
  'on-track': 'On track',
  ahead: 'Ahead of schedule',
  behind: 'Behind schedule',
  'off-track': 'Not reached in the forecast',
  untracked: 'Target missing',
};
