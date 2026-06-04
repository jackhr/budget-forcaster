import { describe, it, expect } from 'vitest';
import { buildForecast, buildSavings, buildNetWorth, buildDebtCharges, buildExpensePlan, buildAccountSeries, buildScheduledOutByAccount, monthOffset } from './forecast';
import { simulateDebtPlan } from './debt';
import type { Account, Debt, Expense, IncomeSource, ScheduledPayment } from '../types';

const NOW = new Date(2026, 0, 1); // Jan 2026, deterministic

function income(over: Partial<IncomeSource>): IncomeSource {
  return { id: 1, name: 'I', monthly_amount: 0, frequency: 'monthly', group_id: null, start_date: null, account_id: null, created_at: '', updated_at: '', ...over };
}
function expense(over: Partial<Expense>): Expense {
  return { id: 1, name: 'E', monthly_amount: 0, frequency: 'monthly', start_date: null, end_date: null, group_id: null, funding_allocations: [], created_at: '', updated_at: '', ...over };
}
function acct(id: number, name: string, balance: number, primary = false): Account {
  return { id, name, balance, is_primary: primary ? 1 : 0, sort_order: null, created_at: '', updated_at: '' };
}
function flat(amount: number, months: number): number[] {
  return Array(months).fill(amount);
}

describe('buildForecast', () => {
  it('computes net as income minus expenses', () => {
    const inc = [income({ monthly_amount: 5000 })];
    const fc = buildForecast(inc, flat(2000, 3), [], [], 3, NOW);
    expect(fc[0].income).toBe(5000);
    expect(fc[0].expenses).toBe(2000);
    expect(fc[0].net).toBe(3000);
  });

  it('includes debt outflow in expenses', () => {
    const fc = buildForecast([], flat(0, 3), [], [300, 300, 0], 3, NOW);
    expect(fc[0].expenses).toBe(300);
    expect(fc[2].expenses).toBe(0);
  });

  it('honors an income start date (no income before it)', () => {
    const inc = [income({ monthly_amount: 1000, start_date: '2026-03-01' })]; // offset 2 from Jan 2026
    const fc = buildForecast(inc, flat(0, 4), [], [], 4, NOW);
    expect(fc[0].income).toBe(0);
    expect(fc[1].income).toBe(0);
    expect(fc[2].income).toBe(1000);
    expect(fc[3].income).toBe(1000);
  });
});

describe('buildExpensePlan', () => {
  it('applies inflation to ongoing expenses over time', () => {
    const ep = buildExpensePlan([expense({ monthly_amount: 1000 })], [acct(1, 'Cash', 0, true)], [], 13, 12, NOW);
    expect(ep.ongoingCashOut[0]).toBeCloseTo(1000, 5);
    expect(ep.ongoingCashOut[12]).toBeCloseTo(1120, 0); // +12% after a year
  });

  it('honors an expense frequency and date range', () => {
    const cash = [acct(1, 'Cash', 0, true)];
    // Quarterly $300 from Mar 2026 (offset 2) through Aug 2026 (offset 7): bills at offset 2 and 5 only.
    const exp = [expense({ monthly_amount: 300, frequency: 'quarterly', start_date: '2026-03-01', end_date: '2026-08-01' })];
    const ep = buildExpensePlan(exp, cash, [], 10, 0, NOW);
    expect(ep.ongoingCashOut[0]).toBe(0);
    expect(ep.ongoingCashOut[1]).toBe(0);
    expect(ep.ongoingCashOut[2]).toBe(300); // Mar
    expect(ep.ongoingCashOut[3]).toBe(0);
    expect(ep.ongoingCashOut[5]).toBe(300); // Jun
    expect(ep.ongoingCashOut[8]).toBe(0);   // past end
  });

  it('splits a bill across cash and a card; remainder to the primary account', () => {
    const accounts = [acct(1, 'Cash', 0, true)];
    const debts: Debt[] = [{ id: 5, name: 'Visa', balance: 0, apr: 20, credit_limit: null, monthly_payment: 100, group_id: null, created_at: '', updated_at: '' }];
    const exp = [expense({
      id: 1, monthly_amount: 1000, funding_allocations: [
        { source_type: 'debt', source_id: 5, alloc_type: 'percent', value: 50 },
        { source_type: 'account', source_id: 1, alloc_type: 'fixed', value: 200 },
      ],
    })];
    const ep = buildExpensePlan(exp, accounts, debts, 1, 0);
    // fixed $200 to cash, then 50% ($500) to the card, remainder $300 to primary (cash).
    expect(ep.ongoingCashOut[0]).toBe(500);          // 200 + 300
    expect(ep.outByAccount.get(1)![0]).toBe(500);
    expect(ep.charges).toEqual([{ debtId: 5, monthIndex: 0, amount: 500 }]);
  });

  it('charged portions feed the debt and lower cash outflow accordingly', () => {
    const accounts = [acct(1, 'Cash', 1000, true)];
    const card: Debt = { id: 5, name: 'Visa', balance: 0, apr: 24, credit_limit: null, monthly_payment: 1000, group_id: null, created_at: '', updated_at: '' };
    const exp = [expense({ id: 1, monthly_amount: 400, funding_allocations: [{ source_type: 'debt', source_id: 5, alloc_type: 'percent', value: 100 }] })];
    const ep = buildExpensePlan(exp, accounts, [card], 2, 0);
    expect(ep.ongoingCashOut[0]).toBe(0); // 100% on the card -> no cash out
    const sv = buildSavings([], ep.ongoingCashOut, [], simulateDebtPlan([card], 0, 'none', 2, ep.charges).outflow, 2, 1000, NOW);
    expect(sv[0].expenses).toBe(0);       // the expense doesn't dip cash
    expect(sv[0].debtOut).toBe(400);      // the card payment covers the charge
  });
});

describe('buildSavings', () => {
  it('accumulates net into a running balance from the starting cash', () => {
    const inc = [income({ monthly_amount: 1000 })];
    const sv = buildSavings(inc, flat(400, 3), [], [], 3, 5000, NOW);
    expect(sv[0].balance).toBe(5600);
    expect(sv[1].balance).toBe(6200);
    expect(sv[2].balance).toBe(6800);
  });

  it('subtracts a one-off future expense in the right month', () => {
    const pay: ScheduledPayment = { id: 1, name: 'Trip', amount: 1000, frequency: 'one-time', start_date: '2026-03-01', end_date: null, funding_source_type: 'cash', funding_source_id: null, created_at: '', updated_at: '' };
    const sv = buildSavings([], flat(0, 4), [pay], [], 4, 1000, NOW);
    expect(monthOffset('2026-03-01', NOW)).toBe(2);
    expect(sv[2].scheduledOut).toBe(1000);
    expect(sv[2].balance).toBe(0);
  });
});

describe('debt-funded future expenses', () => {
  const card: Debt = { id: 9, name: 'Card', balance: 0, apr: 24, credit_limit: null, monthly_payment: 500, group_id: null, created_at: '', updated_at: '' };
  const charged: ScheduledPayment = {
    id: 1, name: 'Laptop', amount: 2000, frequency: 'one-time', start_date: '2026-02-01', end_date: null,
    funding_source_type: 'debt', funding_source_id: 9, created_at: '', updated_at: '',
  };

  it('does not dip cash for a charged expense', () => {
    const sv = buildSavings([], flat(0, 4), [charged], [0, 0, 0, 0], 4, 5000, NOW);
    expect(sv[1].scheduledOut).toBe(0);
  });

  it('adds the charge to the card balance via simulateDebtPlan', () => {
    const charges = buildDebtCharges([charged], 6, NOW);
    expect(charges).toEqual([{ debtId: 9, monthIndex: 1, amount: 2000 }]);
    const plan = simulateDebtPlan([card], 0, 'none', 6, charges);
    expect(plan.remaining[0]).toBe(0);
    expect(plan.remaining[1]).toBeGreaterThan(1400);
    expect(plan.outflow[1]).toBeCloseTo(500, 5);
  });
});

describe('buildAccountSeries', () => {
  it('routes income to its account; primary bears outflows; sum equals savings balance', () => {
    const accounts = [acct(1, 'Checking', 1000, true), acct(2, 'Savings', 500)];
    const sources = [
      income({ id: 10, monthly_amount: 2000, account_id: 1 }),
      income({ id: 11, monthly_amount: 300, account_id: 2 }),
    ];
    const ep = buildExpensePlan([expense({ monthly_amount: 800 })], accounts, [], 3, 0);
    const sv = buildSavings(sources, ep.ongoingCashOut, [], [], 3, 1500, NOW);
    const bd = buildAccountSeries(accounts, sources, sv, ep.outByAccount, new Map(), NOW);

    const savingsSeries = bd.series.find((s) => s.id === 2)!;
    expect(savingsSeries.values[0]).toBe(800);  // 500 + 300
    expect(savingsSeries.values[1]).toBe(1100);

    const checking = bd.series.find((s) => s.id === 1)!;
    expect(checking.values[0]).toBe(1000 + 2000 - 800);

    bd.total.forEach((t, i) => {
      const sum = bd.series.reduce((acc, s) => acc + s.values[i], 0);
      expect(Math.round(sum)).toBe(Math.round(t));
      expect(t).toBe(sv[i].balance);
    });
  });

  it('sends unassigned income to the primary account', () => {
    const accounts = [acct(1, 'Primary', 0, true), acct(2, 'Other', 0)];
    const sources = [income({ id: 9, monthly_amount: 100, account_id: null })];
    const ep = buildExpensePlan([], accounts, [], 2, 0);
    const sv = buildSavings(sources, ep.ongoingCashOut, [], [], 2, 0, NOW);
    const bd = buildAccountSeries(accounts, sources, sv, ep.outByAccount, new Map(), NOW);
    expect(bd.series.find((s) => s.id === 1)!.values[0]).toBe(100);
    expect(bd.series.find((s) => s.id === 2)!.values[0]).toBe(0);
  });
});

describe('future-expense funding source (account vs card)', () => {
  const pay = (over: Partial<ScheduledPayment>): ScheduledPayment => ({
    id: 1, name: 'P', amount: 100, frequency: 'monthly', start_date: '2026-01-01', end_date: null,
    funding_source_type: 'account', funding_source_id: null, created_at: '', updated_at: '', ...over,
  });

  it('attributes an account-funded payment to that account, not primary', () => {
    const accounts = [acct(1, 'Primary', 0, true), acct(2, 'Vacation', 0)];
    const payments = [pay({ amount: 100, funding_source_type: 'account', funding_source_id: 2 })];
    const map = buildScheduledOutByAccount(payments, accounts, 2, NOW);
    expect(map.get(2)![0]).toBe(100);
    expect(map.get(1)![0]).toBe(0);
  });

  it('routes legacy cash funding to the primary account; skips card-funded', () => {
    const accounts = [acct(1, 'Primary', 0, true)];
    const payments = [
      pay({ id: 1, amount: 50, funding_source_type: 'cash', funding_source_id: null }),
      pay({ id: 2, amount: 999, funding_source_type: 'debt', funding_source_id: 7 }),
    ];
    const map = buildScheduledOutByAccount(payments, accounts, 1, NOW);
    expect(map.get(1)![0]).toBe(50); // cash -> primary; debt excluded
  });
});

describe('buildNetWorth', () => {
  it('is cash minus remaining debt', () => {
    const sv = buildSavings([income({ monthly_amount: 1000 })], flat(0, 2), [], [200, 200], 2, 0, NOW);
    const nw = buildNetWorth(sv, [800, 600]);
    expect(nw[0].cash).toBe(sv[0].balance);
    expect(nw[0].debt).toBe(800);
    expect(nw[0].netWorth).toBe(sv[0].balance - 800);
  });
});
