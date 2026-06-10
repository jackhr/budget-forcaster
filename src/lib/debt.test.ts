import { describe, it, expect } from 'vitest';
import { simulateDebt, summarizeDebt, simulateDebtPlan } from './debt';
import type { Debt } from '../types';

function makeDebt(over: Partial<Debt>): Debt {
  return {
    id: 1, name: 'D', balance: 0, apr: 0, credit_limit: null, monthly_payment: 0,
    debt_type: 'credit_card', payment_day: null,
    group_id: null, account_id: null, funding_allocations: [], funding_rules: [], created_at: '', updated_at: '', ...over,
  };
}

describe('simulateDebt', () => {
  it('amortizes a credit card', () => {
    const sim = simulateDebt(4200, 19.9, 300);
    expect(sim.neverPaysOff).toBe(false);
    expect(sim.payoffMonthIndex).toBe(16); // 17th payment (0-based)
    expect(sim.totalInterest).toBeCloseTo(618.85, 1);
  });

  it('handles 0% APR as simple division', () => {
    const sim = simulateDebt(1200, 0, 100);
    expect(sim.payoffMonthIndex).toBe(11); // exactly 12 payments
    expect(sim.totalInterest).toBe(0);
  });

  it('flags a payment that cannot cover interest', () => {
    const sim = simulateDebt(5000, 24, 90); // 2%/mo = $100 > $90
    expect(sim.neverPaysOff).toBe(true);
    expect(sim.payoffMonthIndex).toBeNull();
  });

  it('treats a zero balance as already paid', () => {
    const sim = simulateDebt(0, 20, 100);
    expect(sim.neverPaysOff).toBe(false);
    expect(sim.payments).toEqual([]);
  });
});

describe('summarizeDebt', () => {
  it('reports utilization when a limit is set', () => {
    const s = summarizeDebt(makeDebt({ balance: 3000, credit_limit: 6000, apr: 18, monthly_payment: 200 }));
    expect(s.utilization).toBeCloseTo(0.5, 5);
    expect(s.monthsToPayoff).toBeGreaterThan(0);
  });
});

describe('simulateDebtPlan', () => {
  const debts = [
    makeDebt({ id: 1, name: 'A', balance: 1000, apr: 24, monthly_payment: 100 }),
    makeDebt({ id: 2, name: 'B', balance: 5000, apr: 6, monthly_payment: 100 }),
  ];

  it("'none' equals the sum of independent simulations", () => {
    const plan = simulateDebtPlan(debts, 0, 'none', 120);
    const a = simulateDebt(1000, 24, 100);
    const b = simulateDebt(5000, 6, 100);
    expect(plan.outflow[0]).toBeCloseTo(200, 5);
    // remaining at month 0 should equal both balances after first payment
    expect(plan.payoffMonthByDebt.get(1)).toBe(a.payoffMonthIndex);
    expect(plan.payoffMonthByDebt.get(2)).toBe(b.payoffMonthIndex);
  });

  it('avalanche targets the highest APR first and saves interest vs none', () => {
    const none = simulateDebtPlan(debts, 0, 'none', 240);
    const aval = simulateDebtPlan(debts, 200, 'avalanche', 240);
    expect(aval.totalInterest).toBeLessThan(none.totalInterest);
    // higher-APR debt (id 1) clears no later than under 'none'
    expect(aval.payoffMonthByDebt.get(1)!).toBeLessThanOrEqual(none.payoffMonthByDebt.get(1)!);
    expect(aval.debtFreeMonthIndex!).toBeLessThan(none.debtFreeMonthIndex!);
  });

  it('keeps total monthly budget constant (minimums + extra)', () => {
    const aval = simulateDebtPlan(debts, 150, 'avalanche', 6);
    // first month: 100 + 100 minimums + 150 extra = 350
    expect(aval.outflow[0]).toBeCloseTo(350, 5);
  });
});

describe('simulateDebtPlan charges & credit limits', () => {
  it('charges a credit card and grows its balance', () => {
    const card = makeDebt({ id: 1, balance: 0, apr: 0, monthly_payment: 0, debt_type: 'credit_card' });
    const plan = simulateDebtPlan([card], 0, 'none', 3, [{ debtId: 1, monthIndex: 0, amount: 500 }]);
    expect(plan.remainingByDebt.get(1)![0]).toBeCloseTo(500, 5);
    expect(plan.chargeOverflow.every((v) => v === 0)).toBe(true);
  });

  it('allows a charge past available credit and flags the card as over limit', () => {
    const card = makeDebt({ id: 1, balance: 800, apr: 0, monthly_payment: 0, credit_limit: 1000, debt_type: 'credit_card' });
    const plan = simulateDebtPlan([card], 0, 'none', 1, [{ debtId: 1, monthIndex: 0, amount: 500 }]);
    expect(plan.remainingByDebt.get(1)![0]).toBeCloseTo(1300, 5);
    expect(plan.chargeOverflow[0]).toBe(0);
    expect(plan.overLimitByDebt.get(1)).toBe(0);
  });

  it('flags the first month a future charge puts a card over limit', () => {
    const card = makeDebt({ id: 1, balance: 800, apr: 0, monthly_payment: 0, credit_limit: 1000, debt_type: 'credit_card' });
    const plan = simulateDebtPlan([card], 0, 'none', 3, [{ debtId: 1, monthIndex: 1, amount: 500 }]);
    expect(plan.overLimitByDebt.get(1)).toBe(1);
  });

  it('never charges a loan — the whole amount overflows to cash', () => {
    const loan = makeDebt({ id: 1, balance: 5000, apr: 0, monthly_payment: 0, debt_type: 'loan' });
    const plan = simulateDebtPlan([loan], 0, 'none', 1, [{ debtId: 1, monthIndex: 0, amount: 400 }]);
    expect(plan.remainingByDebt.get(1)![0]).toBeCloseTo(5000, 5); // unchanged
    expect(plan.chargeOverflow[0]).toBeCloseTo(400, 5);
  });

  it('overflows charges aimed at an unknown debt', () => {
    const card = makeDebt({ id: 1, balance: 0, apr: 0, monthly_payment: 0 });
    const plan = simulateDebtPlan([card], 0, 'none', 1, [{ debtId: 999, monthIndex: 0, amount: 250 }]);
    expect(plan.chargeOverflow[0]).toBeCloseTo(250, 5);
  });
});
