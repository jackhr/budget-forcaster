// Derivations behind the Home screen. Everything here is pure and takes `now`,
// like the rest of src/lib, so the "state of affairs" is testable.
import type { Breakdown } from './forecast';
import type { MonthBreakdown, MonthObligation } from './monthlyBreakdown';

export interface RunwayRisk {
  /** The account that dips furthest below zero, if any does. */
  accountName: string;
  /** The balance at the low point (negative). */
  amount: number;
  monthIndex: number;
  monthLabel: string;
}

export interface RunwayLow {
  /** Lowest total cash across the horizon, whether or not it's a problem. */
  amount: number;
  monthIndex: number;
  monthLabel: string;
}

/**
 * The first month any single account is projected to go negative — the question
 * "will I be short?" in its actionable form. Total cash can look healthy while
 * one account is overdrawn, so this looks per account, not at the total.
 *
 * Ties on month are broken by depth, so the worst account that month is named.
 */
export function findRunwayRisk(accountSeries: Breakdown): RunwayRisk | null {
  let worst: RunwayRisk | null = null;
  for (const series of accountSeries.series) {
    for (let m = 0; m < series.values.length; m++) {
      const amount = series.values[m];
      if (amount >= -0.005) continue;
      const better = !worst
        || m < worst.monthIndex
        || (m === worst.monthIndex && amount < worst.amount);
      if (better) {
        worst = {
          accountName: series.name,
          amount,
          monthIndex: m,
          monthLabel: accountSeries.labels[m] ?? '',
        };
      }
      break; // only the first dip per account matters
    }
  }
  return worst;
}

/** The low-water mark of total cash, used when nothing actually goes negative. */
export function findCashLow(accountSeries: Breakdown): RunwayLow | null {
  const { total, labels } = accountSeries;
  if (total.length === 0) return null;
  let index = 0;
  for (let m = 1; m < total.length; m++) {
    if (total[m] < total[index]) index = m;
  }
  return { amount: total[index], monthIndex: index, monthLabel: labels[index] ?? '' };
}

export interface UpcomingEvent extends MonthObligation {
  /** Days from today; 0 = today. */
  daysAway: number;
}

function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

function parseISO(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/**
 * Everything dated in the next `days` days, drawn from consecutive month
 * breakdowns. Paid and received items are dropped: they've already happened,
 * and the point of this list is what's still coming.
 */
export function upcomingEvents(
  months: MonthBreakdown[],
  days = 30,
  now: Date = new Date(),
): UpcomingEvent[] {
  const today = startOfDay(now);
  const horizon = today + days * 86400_000;
  const out: UpcomingEvent[] = [];

  for (const month of months) {
    for (const event of month.events) {
      if (event.paid) continue;
      const at = startOfDay(parseISO(event.date));
      if (at < today || at > horizon) continue;
      out.push({ ...event, daysAway: Math.round((at - today) / 86400_000) });
    }
  }

  return out.sort((a, b) =>
    a.daysAway - b.daysAway
    // money in before money out on the same day, then larger amounts first
    || (a.direction === b.direction ? b.amount - a.amount : a.direction === 'in' ? -1 : 1));
}

export interface UpcomingTotals {
  in: number;
  out: number;
  net: number;
}

export function totalsFor(events: UpcomingEvent[]): UpcomingTotals {
  let moneyIn = 0;
  let moneyOut = 0;
  for (const e of events) {
    if (e.direction === 'in') moneyIn += e.amount;
    else moneyOut += e.amount;
  }
  return {
    in: Math.round(moneyIn * 100) / 100,
    out: Math.round(moneyOut * 100) / 100,
    net: Math.round((moneyIn - moneyOut) * 100) / 100,
  };
}

/** "Today", "Tomorrow", "In 5 days", "Nov 18" — whichever reads best. */
export function whenLabel(event: UpcomingEvent, now: Date = new Date()): string {
  if (event.daysAway === 0) return 'Today';
  if (event.daysAway === 1) return 'Tomorrow';
  if (event.daysAway <= 6) return `In ${event.daysAway} days`;
  const date = parseISO(event.date);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: date.getFullYear() === now.getFullYear() ? undefined : 'numeric',
  });
}
