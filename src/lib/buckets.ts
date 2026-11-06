// Buckets: money set aside inside an account.
//
// A bucket never moves cash. The account's balance is exactly what the
// forecast says it is; a bucket only says how much of it is spoken for. So the
// cash engine is untouched, and everything here is derived on top of it:
//
//   available = account balance − what its buckets hold
//
// When an account can't cover its buckets, the plan is promising money that
// isn't there. Following "model reality truthfully, then warn", the bucket
// keeps growing on schedule and the shortfall is reported rather than hidden.
// Pure, and takes `now`, like the rest of src/lib.
import type { Account, Bucket } from '../types';
import { scheduledAtMonth, type Breakdown } from './forecast';

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Which account holds a bucket: its own if it still exists, else the primary. */
export function bucketAccountId(bucket: Bucket, accounts: Account[]): number | null {
  if (bucket.account_id != null && accounts.some((a) => a.id === bucket.account_id)) return bucket.account_id;
  return (accounts.find((a) => a.is_primary) ?? accounts[0])?.id ?? null;
}

/**
 * A bucket's balance at the end of each month: today's amount plus every
 * scheduled contribution, stopping at the target. Never decreases — money
 * only leaves a bucket when you take it out, which the plan doesn't schedule.
 */
export function bucketSeries(bucket: Bucket, months: number, now: Date = new Date()): number[] {
  const cap = bucket.target_amount ?? Infinity;
  let balance = bucket.balance;
  return Array.from({ length: months }, (_, m) => {
    const add = scheduledAtMonth(bucket.contribution, bucket.frequency, bucket.start_date, bucket.end_date, m, now);
    // A bucket already over its target (set aside more than the cap) keeps what it has.
    if (balance < cap) balance = Math.min(cap, balance + add);
    return round2(balance);
  });
}

/** The first month a bucket reaches its target, or null if it has none or never does. */
export function bucketFullMonth(bucket: Bucket, series: number[]): number | null {
  if (bucket.target_amount == null) return null;
  const i = series.findIndex((v) => v >= bucket.target_amount! - 0.005);
  return i === -1 ? null : i;
}

export interface BucketShortfall {
  accountId: number;
  /** -1 = today, before any forecast month; otherwise the first month index. */
  monthIndex: number;
  /** How far the account falls short of its buckets in that month. */
  shortBy: number;
}

export interface BucketPlan {
  /** Per bucket, its balance at the end of each month. */
  series: Map<number, number[]>;
  /** Per account, what its buckets hold each month. */
  committedByAccount: Map<number, number[]>;
  /** Per account, its projected balance minus its buckets. Can go negative. */
  availableByAccount: Map<number, number[]>;
  /** Per account, today's balance minus what its buckets hold today. */
  availableToday: Map<number, number>;
  /** The first month each account can't cover its buckets, if it ever can't. */
  shortfalls: BucketShortfall[];
}

/**
 * Lay buckets over the per-account cash projection.
 *
 * `accountSeries` is the forecast's own per-account balance series, so
 * "available" is always measured against the same numbers every other view
 * shows.
 */
export function buildBucketPlan(
  buckets: Bucket[],
  accounts: Account[],
  accountSeries: Breakdown,
  months: number,
  now: Date = new Date(),
): BucketPlan {
  const series = new Map<number, number[]>();
  const committedByAccount = new Map<number, number[]>();
  const committedToday = new Map<number, number>();

  for (const bucket of buckets) {
    const values = bucketSeries(bucket, months, now);
    series.set(bucket.id, values);
    const accountId = bucketAccountId(bucket, accounts);
    if (accountId == null) continue;
    const sums = committedByAccount.get(accountId) ?? new Array(months).fill(0);
    values.forEach((v, m) => { sums[m] += v; });
    committedByAccount.set(accountId, sums);
    committedToday.set(accountId, (committedToday.get(accountId) ?? 0) + bucket.balance);
  }

  const availableByAccount = new Map<number, number[]>();
  const availableToday = new Map<number, number>();
  const shortfalls: BucketShortfall[] = [];

  for (const account of accounts) {
    const committed = committedByAccount.get(account.id);
    const projected = accountSeries.series.find((s) => s.id === account.id)?.values ?? [];
    const today = round2(account.balance - (committedToday.get(account.id) ?? 0));
    availableToday.set(account.id, today);
    const available = Array.from({ length: months }, (_, m) =>
      round2((projected[m] ?? account.balance) - (committed?.[m] ?? 0)));
    availableByAccount.set(account.id, available);
    if (!committed) continue;

    if (today < -0.005) {
      shortfalls.push({ accountId: account.id, monthIndex: -1, shortBy: round2(-today) });
      continue;
    }
    const m = available.findIndex((v) => v < -0.005);
    if (m !== -1) shortfalls.push({ accountId: account.id, monthIndex: m, shortBy: round2(-available[m]) });
  }

  for (const values of committedByAccount.values()) {
    for (let m = 0; m < values.length; m++) values[m] = round2(values[m]);
  }

  return { series, committedByAccount, availableByAccount, availableToday, shortfalls };
}

/** "+$500 / month", "+$15,000 / year", "$2,000 once" — the contribution in words. */
export const CONTRIBUTION_PERIOD: Record<Bucket['frequency'], string> = {
  weekly: 'week',
  biweekly: '2 weeks',
  semimonthly: 'half-month',
  monthly: 'month',
  quarterly: 'quarter',
  annually: 'year',
  'one-time': 'once',
};
