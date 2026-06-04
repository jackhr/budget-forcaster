import { describe, it, expect } from 'vitest';
import { buildForecast, buildSavings, buildNetWorth, buildDebtCharges, buildAccountSeries, monthOffset } from './forecast';
import { simulateDebtPlan } from './debt';
import type { Account, Debt, Expense, IncomeSource, ScheduledPayment } from '../types';

const NOW = new Date(2026, 0, 1); // Jan 2026, deterministic

function income(over: Partial<IncomeSource>): IncomeSource {
  return { id: 1, name: 'I', monthly_amount: 0, frequency: 'monthly', group_id: null, start_date: null, account_id: null, created_at: '', updated_at: '', ...over };
}
function expense(over: Partial<Expense>): Expense {
  return { id: 1, name: 'E', monthly_amount: 0, group_id: null, created_at: '', updated_at: '', ...over };
}

describe('buildForecast', () => {
  it('computes net as income minus expenses', () => {
    const inc = [income({ monthly_amount: 5000 })];
    const exp = [expense({ monthly_amount: 2000 })];
    const fc = buildForecast(inc, exp, [], [], 3, 0, NOW);
    expect(fc[0].income).toBe(5000);
    expect(fc[0].expenses).toBe(2000);
    expect(fc[0].net).toBe(3000);
  });

  it('applies inflation to ongoing expenses over time', () => {
    const exp = [expense({ monthly_amount: 1000 })];
    const fc = buildForecast([], exp, [], [], 13, 12, NOW); // 12% annual
    expect(fc[0].expenses).toBeCloseTo(1000, 5);
    expect(fc[12].expenses).toBeCloseTo(1120, 0); // +12% after a year
  });

  it('includes debt outflow in expenses', () => {
    const fc = buildForecast([], [], [], [300, 300, 0], 3, 0, NOW);
    expect(fc[0].expenses).toBe(300);
    expect(fc[2].expenses).toBe(0);
  });

  it('honors an income start date (no income before it)', () => {
    const inc = [income({ monthly_amount: 1000, start_date: '2026-03-01' })]; // offset 2 from Jan 2026
    const fc = buildForecast(inc, [], [], [], 4, 0, NOW);
    expect(fc[0].income).toBe(0);
    expect(fc[1].income).toBe(0);
    expect(fc[2].income).toBe(1000);
    expect(fc[3].income).toBe(1000);
  });
});

describe('buildSavings', () => {
  it('accumulates net into a running balance from the starting cash', () => {
    const inc = [income({ monthly_amount: 1000 })];
    const exp = [expense({ monthly_amount: 400 })];
    const sv = buildSavings(inc, exp, [], [], 3, 5000, 0, NOW);
    expect(sv[0].balance).toBe(5600);
    expect(sv[1].balance).toBe(6200);
    expect(sv[2].balance).toBe(6800);
  });

  it('subtracts a one-off future expense in the right month', () => {
    const pay: ScheduledPayment = { id: 1, name: 'Trip', amount: 1000, frequency: 'one-time', start_date: '2026-03-01', end_date: null, funding_source_type: 'cash', funding_source_id: null, created_at: '', updated_at: '' };
    const sv = buildSavings([], [], [pay], [], 4, 1000, 0, NOW);
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
    const sv = buildSavings([], [], [charged], [0, 0, 0, 0], 4, 5000, 0, NOW);
    // scheduledOut stays 0 because it's billed to the card, not paid from cash
    expect(sv[1].scheduledOut).toBe(0);
  });

  it('adds the charge to the card balance via simulateDebtPlan', () => {
    const charges = buildDebtCharges([charged], 6, NOW);
    expect(charges).toEqual([{ debtId: 9, monthIndex: 1, amount: 2000 }]);
    const plan = simulateDebtPlan([card], 0, 'none', 6, charges);
    // month 0: nothing owed yet; month 1: charged 2000, pays 500 -> ~1500ish remaining
    expect(plan.remaining[0]).toBe(0);
    expect(plan.remaining[1]).toBeGreaterThan(1400);
    expect(plan.outflow[1]).toBeCloseTo(500, 5);
  });
});

describe('buildAccountSeries', () => {
  const acct = (id: number, name: string, balance: number, primary = false): Account => ({
    id, name, balance, is_primary: primary ? 1 : 0, sort_order: null, created_at: '', updated_at: '',
  });

  it('routes income to its account; primary bears outflows; sum equals savings balance', () => {
    const accounts = [acct(1, 'Checking', 1000, true), acct(2, 'Savings', 500)];
    const sources = [
      income({ id: 10, monthly_amount: 2000, account_id: 1 }), // into Checking
      income({ id: 11, monthly_amount: 300, account_id: 2 }),  // into Savings
    ];
    const expenses = [expense({ monthly_amount: 800 })];
    const sv = buildSavings(sources, expenses, [], [], 3, 1500, 0, NOW);
    const bd = buildAccountSeries(accounts, sources, sv, NOW);

    // Savings only grows from its assigned income (no outflows there).
    const savingsSeries = bd.series.find((s) => s.id === 2)!;
    expect(savingsSeries.values[0]).toBe(800);  // 500 + 300
    expect(savingsSeries.values[1]).toBe(1100);

    // Checking gets its income minus all expenses.
    const checking = bd.series.find((s) => s.id === 1)!;
    expect(checking.values[0]).toBe(1000 + 2000 - 800);

    // The per-account total mirrors the savings balance each month.
    bd.total.forEach((t, i) => {
      const sum = bd.series.reduce((acc, s) => acc + s.values[i], 0);
      expect(Math.round(sum)).toBe(Math.round(t));
      expect(t).toBe(sv[i].balance);
    });
  });

  it('sends unassigned income to the primary account', () => {
    const accounts = [acct(1, 'Primary', 0, true), acct(2, 'Other', 0)];
    const sources = [income({ id: 9, monthly_amount: 100, account_id: null })];
    const sv = buildSavings(sources, [], [], [], 2, 0, 0, NOW);
    const bd = buildAccountSeries(accounts, sources, sv, NOW);
    expect(bd.series.find((s) => s.id === 1)!.values[0]).toBe(100);
    expect(bd.series.find((s) => s.id === 2)!.values[0]).toBe(0);
  });
});

describe('buildNetWorth', () => {
  it('is cash minus remaining debt', () => {
    const sv = buildSavings([income({ monthly_amount: 1000 })], [], [], [200, 200], 2, 0, 0, NOW);
    const nw = buildNetWorth(sv, [800, 600]);
    expect(nw[0].cash).toBe(sv[0].balance);
    expect(nw[0].debt).toBe(800);
    expect(nw[0].netWorth).toBe(sv[0].balance - 800);
  });
});
