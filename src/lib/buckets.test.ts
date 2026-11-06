import { describe, expect, it } from 'vitest';
import { bucketFullMonth, bucketSeries, buildBucketPlan } from './buckets';
import type { Account, Bucket } from '../types';

const NOW = new Date(2026, 10, 1); // Nov 2026

const bucket = (over: Partial<Bucket> = {}): Bucket => ({
  id: 1, name: 'Emergency', account_id: 1, balance: 1000, target_amount: null, contribution: 500,
  frequency: 'monthly', start_date: null, end_date: null, note: null, sort_order: 0, created_at: '', updated_at: '', ...over,
});
const account = (id: number, balance: number, primary = false): Account =>
  ({ id, name: `A${id}`, balance, is_primary: primary ? 1 : 0, sort_order: null, created_at: '', updated_at: '' });

describe('bucketSeries', () => {
  it('adds each contribution to what is set aside today', () => {
    expect(bucketSeries(bucket(), 3, NOW)).toEqual([1500, 2000, 2500]);
  });

  it('stops at the target without overshooting it', () => {
    const b = bucket({ target_amount: 2200 });
    const s = bucketSeries(b, 4, NOW);
    expect(s).toEqual([1500, 2000, 2200, 2200]);
    expect(bucketFullMonth(b, s)).toBe(2);
  });

  it('follows an annual schedule anchored to its start, like an expense', () => {
    // Set aside part of a January bonus each year.
    const s = bucketSeries(bucket({ balance: 0, contribution: 15000, frequency: 'annually', start_date: '2027-01-01' }), 15, NOW);
    expect(s[1]).toBe(0);       // Dec 2026
    expect(s[2]).toBe(15000);   // Jan 2027
    expect(s[13]).toBe(15000);  // Dec 2027
    expect(s[14]).toBe(30000);  // Jan 2028
  });

  it('keeps more than its target when that much is already set aside', () => {
    expect(bucketSeries(bucket({ balance: 3000, target_amount: 2000 }), 2, NOW)).toEqual([3000, 3000]);
  });
});

describe('buildBucketPlan', () => {
  const accounts = [account(1, 4000, true), account(2, 100)];
  const series = {
    labels: ['Nov', 'Dec', 'Jan'],
    total: [0, 0, 0],
    series: [{ id: 1, name: 'A1', values: [4200, 4400, 2000] }, { id: 2, name: 'A2', values: [100, 100, 100] }],
  };

  it("subtracts an account's buckets from its balance", () => {
    const plan = buildBucketPlan([bucket()], accounts, series, 3, NOW);
    expect(plan.committedByAccount.get(1)).toEqual([1500, 2000, 2500]);
    expect(plan.availableByAccount.get(1)).toEqual([2700, 2400, -500]);
    expect(plan.availableToday.get(1)).toBe(3000);
    // An account with no buckets is all available.
    expect(plan.availableByAccount.get(2)).toEqual([100, 100, 100]);
  });

  it('reports the first month an account cannot cover its buckets', () => {
    const plan = buildBucketPlan([bucket()], accounts, series, 3, NOW);
    expect(plan.shortfalls).toEqual([{ accountId: 1, monthIndex: 2, shortBy: 500 }]);
  });

  it('reports a shortfall today when more is set aside than the account holds', () => {
    const plan = buildBucketPlan([bucket({ account_id: 2, balance: 250 })], accounts, series, 3, NOW);
    expect(plan.shortfalls).toEqual([{ accountId: 2, monthIndex: -1, shortBy: 150 }]);
  });

  it('puts a bucket whose account is gone in the primary account', () => {
    const plan = buildBucketPlan([bucket({ account_id: 99, contribution: 0 })], accounts, series, 3, NOW);
    expect(plan.committedByAccount.get(1)).toEqual([1000, 1000, 1000]);
  });
});
