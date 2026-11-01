import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import Goals from './Goals';
import type { Account, Debt, Goal } from '../types';
import type { GoalInputs } from '../lib/goals';

const stamps = { created_at: '2026-01-01', updated_at: '2026-01-01' };
const noop = async () => {};

const accounts: Account[] = [
  { id: 2, name: 'Savings', balance: 4000, is_primary: 0, sort_order: 0, ...stamps },
];
const debts: Debt[] = [{
  id: 7, name: 'Rewards card', balance: 4000, apr: 19.9, credit_limit: 6000,
  monthly_payment: 150, debt_type: 'credit_card', payment_day: 10, group_id: null,
  account_id: null, funding_allocations: [], funding_rules: [], ...stamps,
}];

const inputs: GoalInputs = {
  accountSeries: {
    labels: ['Nov', 'Dec', 'Jan'],
    total: [4000, 8000, 12000],
    series: [{ id: 2, name: 'Savings', values: [4000, 8000, 12000] }],
  },
  netWorth: [0, 1, 2].map((i) => ({ month: i, label: `M${i}`, cash: 0, debt: 0, netWorth: i * 1000 })),
  remainingByDebt: new Map([[7, [4000, 2000, 0]]]),
  debtRemaining: [4000, 2000, 0],
  accounts: [{ id: 2, balance: 4000 }],
  debts: [{ id: 7, balance: 4000 }],
  totalCash: 4000,
};

const goal = (over: Partial<Goal> = {}): Goal => ({
  id: 1, name: 'Emergency fund', kind: 'savings', target_amount: 10000, start_amount: null,
  target_date: null, account_id: null, debt_id: null, note: null, sort_order: 0, ...stamps, ...over,
});

function page(goals: Goal[]) {
  return renderToStaticMarkup(
    <Goals
      goals={goals}
      accounts={accounts}
      debts={debts}
      inputs={inputs}
      onAdd={noop}
      onUpdate={noop}
      onDelete={noop}
      onReorder={() => {}}
    />,
  );
}

describe('Goals page', () => {
  it('says goals are optional when there are none', () => {
    // The owner's framing: a feature, not a requirement. Nothing should nag.
    const html = page([]);
    expect(html).toContain('No goals yet');
    expect(html).toContain('Entirely optional');
  });

  it('shows where a savings goal stands and when the plan gets there', () => {
    const html = page([goal()]);
    expect(html).toContain('Emergency fund');
    expect(html).toContain('$4,000');   // current
    expect(html).toContain('$10,000');  // target
    expect(html).toContain('On track');
    expect(html).toContain('40%');
  });

  it('describes a payoff goal as a balance to clear, not an amount to reach', () => {
    const html = page([goal({ kind: 'debt_payoff', target_amount: null, debt_id: 7, start_amount: 8000 })]);
    expect(html).toContain('Clear Rewards card');
    expect(html).toContain('$4,000 left');
    expect(html).toContain('50%'); // half of the recorded 8000 start
  });

  it('flags a goal whose target was deleted instead of tracking the wrong thing', () => {
    const html = page([goal({ account_id: 999 })]);
    expect(html).toContain('Target missing');
    expect(html).toContain('Re-point this goal');
  });

  it('counts how many are reached and warns about the ones at risk', () => {
    const html = page([
      goal({ id: 1, name: 'Done', target_amount: 1000 }),
      goal({ id: 2, name: 'Late', target_amount: 10000, target_date: '2026-01-01' }),
    ]);
    expect(html).toContain('1 / 2');
    expect(html).toContain('1 at risk');
    expect(html).toContain('Behind schedule');
  });

  it('names what each goal tracks', () => {
    expect(page([goal()])).toContain('all cash');
    expect(page([goal({ account_id: 2 })])).toContain('Savings');
    expect(page([goal({ kind: 'net_worth' })])).toContain('net worth');
    expect(page([goal({ kind: 'debt_payoff', target_amount: null })])).toContain('everything owed');
  });

  it('shows a note when one is set', () => {
    expect(page([goal({ note: 'Three months of outgoings' })])).toContain('Three months of outgoings');
  });
});
