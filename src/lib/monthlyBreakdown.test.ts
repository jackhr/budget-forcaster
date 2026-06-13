import { describe, expect, it } from 'vitest';
import type { Account, Debt, Expense, IncomeSource, ScheduledPayment } from '../types';
import { buildMonthBreakdown } from './monthlyBreakdown';

const NOW = new Date(2026, 5, 12);
const accounts: Account[] = [
  { id: 1, name: 'Checking', balance: 0, is_primary: 1, sort_order: null, created_at: '', updated_at: '' },
  { id: 2, name: 'Bills', balance: 0, is_primary: 0, sort_order: null, created_at: '', updated_at: '' },
];

function debt(over: Partial<Debt> = {}): Debt {
  return {
    id: 1, name: 'Card', balance: 1000, apr: 0, credit_limit: 5000, monthly_payment: 100, debt_type: 'credit_card',
    payment_day: 20, group_id: null, account_id: 1, funding_allocations: [], funding_rules: [], created_at: '', updated_at: '', ...over,
  };
}

describe('buildMonthBreakdown', () => {
  it('places obligations on their actual days and builds a cumulative daily line', () => {
    const income: IncomeSource[] = [
      { id: 1, name: 'Paycheck', monthly_amount: 2000, frequency: 'biweekly', start_date: '2026-06-05', group_id: null, account_id: 1, created_at: '', updated_at: '' },
    ];
    const expenses: Expense[] = [
      { id: 1, name: 'Rent', monthly_amount: 1200, frequency: 'monthly', start_date: '2026-01-03', end_date: null, group_id: null, funding_allocations: [], funding_rules: [], created_at: '', updated_at: '' },
    ];
    const future: ScheduledPayment[] = [
      { id: 1, name: 'Trip', amount: 300, frequency: 'one-time', start_date: '2026-06-18', end_date: null, funding_source_type: 'cash', funding_source_id: null, funding_allocations: [], funding_rules: [], created_at: '', updated_at: '' },
    ];

    const result = buildMonthBreakdown(income, expenses, future, [debt()], accounts, 0, NOW);

    expect(result.events.map((event) => [event.name, event.day])).toEqual([
      ['Rent', 3], ['Paycheck', 5], ['Trip', 18], ['Paycheck', 19], ['Card', 20],
    ]);
    expect(result.daily[19].net).toBe(2400);
    expect(result.totalIn).toBe(4000);
    expect(result.totalOut).toBe(1600);
  });

  it('shows every funding rule separately on its scheduled date', () => {
    const planned = debt({
      payment_day: 9,
      funding_rules: [
        { source_type: 'account', source_id: 1, alloc_type: 'fixed', value: 75, frequency: 'monthly', start_date: '2026-06-10', end_date: null },
        { source_type: 'account', source_id: 1, alloc_type: 'percent', value: 50, frequency: 'monthly', start_date: '2026-06-22', end_date: null },
      ],
    });

    const result = buildMonthBreakdown([], [], [], [planned], accounts, 0, NOW);

    expect(result.events.map((event) => [event.day, event.amount, event.detail])).toEqual([
      [10, 75, 'from Checking'],
      [22, 50, 'from Checking'],
    ]);
    expect(result.totalOut).toBe(125);
  });

  it('marks unspecified dates and includes paid current-month obligations in totals', () => {
    const expense: Expense = {
      id: 4, name: 'Legacy bill', monthly_amount: 80, frequency: 'monthly', start_date: null, end_date: null,
      group_id: null, funding_allocations: [], funding_rules: [], created_at: '', updated_at: '',
    };

    const result = buildMonthBreakdown([], [expense], [], [], accounts, 0, NOW, undefined, new Set([4]));

    expect(result.events[0]).toMatchObject({ day: 1, dateSpecified: false, paid: true });
    expect(result.daily[0].events[0]).toMatchObject({ name: 'Legacy bill', paid: true });
    expect(result.totalOut).toBe(80);
  });

  it('tracks total, account, and available-card-credit liquidity by day', () => {
    const cashAccounts: Account[] = [
      { ...accounts[0], balance: 1000 },
      { ...accounts[1], balance: 500 },
    ];
    const card = debt({
      balance: 600,
      credit_limit: 1000,
      account_id: 1,
      payment_day: 20,
      monthly_payment: 100,
    });
    const income: IncomeSource[] = [
      { id: 1, name: 'Paycheck', monthly_amount: 200, frequency: 'one-time', start_date: '2026-06-05', group_id: null, account_id: 2, created_at: '', updated_at: '' },
    ];
    const expenses: Expense[] = [
      {
        id: 1, name: 'Card purchase', monthly_amount: 150, frequency: 'one-time', start_date: '2026-06-10', end_date: null,
        group_id: null, funding_allocations: [{ source_type: 'debt', source_id: 1, alloc_type: 'percent', value: 100 }], funding_rules: [], created_at: '', updated_at: '',
      },
    ];

    const result = buildMonthBreakdown(income, expenses, [], [card], cashAccounts, 0, NOW);
    const total = result.liquidity.find((series) => series.key === 'total')!;
    const checking = result.liquidity.find((series) => series.key === 'account:1')!;
    const bills = result.liquidity.find((series) => series.key === 'account:2')!;
    const credit = result.liquidity.find((series) => series.key === 'card:1')!;

    // Today's balances are reconstructed backward for earlier dates, then used as
    // the anchor for the remaining forecast.
    expect(total.values[0]).toBe(1850);
    expect(bills.values[4]).toBe(500);
    expect(credit.values[9]).toBe(400);
    expect(total.values[11]).toBe(1900);
    expect(checking.values[19]).toBe(900);
    expect(credit.values[19]).toBe(500);
    expect(total.values[19]).toBe(1900);
  });
});
