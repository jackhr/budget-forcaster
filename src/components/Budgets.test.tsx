import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import Budgets, { categoryLabel } from './Budgets';
import { buildBucketPlan } from '../lib/buckets';
import type { Account, Bucket, Expense } from '../types';

const stamps = { created_at: '2026-01-01', updated_at: '2026-01-01' };
const noop = async () => {};
const NOW = new Date(2026, 10, 1);

const accounts: Account[] = [
  { id: 1, name: 'Checking', balance: 3000, is_primary: 1, sort_order: 0, ...stamps },
];
const series = {
  labels: ['Nov 26', 'Dec 26', 'Jan 27'],
  total: [3000, 2500, 1500],
  series: [{ id: 1, name: 'Checking', values: [3000, 2500, 1500] }],
};
const bucket = (over: Partial<Bucket> = {}): Bucket => ({
  id: 1, name: 'Emergency fund', account_id: 1, balance: 1000, target_amount: 2000, contribution: 500,
  frequency: 'monthly', start_date: null, end_date: null, note: null, sort_order: 0, ...stamps, ...over,
});
const budget = (over: Partial<Expense> = {}): Expense => ({
  id: 5, name: 'Groceries', monthly_amount: 800, frequency: 'monthly', start_date: '2026-11-01', end_date: null,
  group_id: null, funding_allocations: [], funding_rules: [], is_budget: 1, budget_categories: ['FOOD_AND_DRINK'],
  spent_this_month: 300, ...stamps, ...over,
});

function page(buckets: Bucket[], budgets: Expense[]) {
  return renderToStaticMarkup(
    <Budgets
      buckets={buckets}
      budgets={budgets}
      accounts={accounts}
      cards={[]}
      categories={[]}
      bucketPlan={buildBucketPlan(buckets, accounts, series, 3, NOW)}
      labels={series.labels}
      onAddBucket={noop} onUpdateBucket={noop} onDeleteBucket={noop} onReorderBuckets={() => {}}
      onAddBudget={noop} onUpdateBudget={noop} onDeleteBudget={noop}
    />,
  );
}

describe('Budgets page', () => {
  it('invites a first bucket and a first budget when there are none', () => {
    const html = page([], []);
    expect(html).toContain('No buckets yet');
    expect(html).toContain('No budgets yet');
  });

  it('shows what is set aside, when it fills, and what is still free', () => {
    const html = page([bucket()], []);
    expect(html).toContain('Emergency fund');
    expect(html).toContain('Full by <strong class="text-text">Dec 26</strong>');
    expect(html).toContain('free of');
  });

  it('flags a bucket its account cannot cover', () => {
    // Checking drops to 1,500 in January while the bucket holds 2,000.
    const html = page([bucket()], []);
    expect(html).toContain('Not covered from Jan 27');
  });

  it("shows a budget's spending this month and what's left", () => {
    const html = page([], [budget()]);
    expect(html).toContain('spent this month');
    expect(html).toContain('left');
    expect(html).toContain('Food and drink');
  });

  it('marks an overspent budget', () => {
    expect(page([], [budget({ spent_this_month: 900 })])).toContain('Over');
  });

  it('says plainly when a budget tracks no categories', () => {
    expect(page([], [budget({ budget_categories: [] })])).toContain('No categories tracked');
  });
});

describe('categoryLabel', () => {
  it('turns a Plaid code into words', () => {
    expect(categoryLabel('FOOD_AND_DRINK')).toBe('Food and drink');
    expect(categoryLabel('GENERAL_MERCHANDISE')).toBe('General merchandise');
  });
});
