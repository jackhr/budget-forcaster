import { describe, it, expect } from 'vitest';
import { simulateDebt, summarizeDebt, simulateDebtPlan, debtPaidDefault } from './debt';
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

  it('a funding-plan payment schedule overrides the monthly payment per month', () => {
    const card = makeDebt({ id: 1, balance: 1000, apr: 0, monthly_payment: 100 });
    // monthly_payment 100 for month 0, then 200 once the plan kicks in
    const schedule = new Map([[1, [100, 200, 200, 200]]]);
    const plan = simulateDebtPlan([card], 0, 'none', 4, [], schedule);
    expect(plan.outflowByDebt.get(1)![0]).toBeCloseTo(100, 5);
    expect(plan.outflowByDebt.get(1)![1]).toBeCloseTo(200, 5);
    // 1000 − 100 − 200 − 200 − 200 = 300 remaining after month 3
    expect(plan.remainingByDebt.get(1)![3]).toBeCloseTo(300, 5);
  });

  it('an active funding plan prevents avalanche rollover from increasing its payment', () => {
    const controlled = makeDebt({ id: 1, balance: 1000, apr: 30, monthly_payment: 100 });
    const payoff = makeDebt({ id: 2, balance: 50, apr: 0, monthly_payment: 100 });
    const schedule = new Map<number, (number | null)[]>([[1, [null, 200, 200]]]);
    const plan = simulateDebtPlan([controlled, payoff], 0, 'avalanche', 3, [], schedule);

    expect(plan.outflowByDebt.get(1)![0]).toBeCloseTo(150, 5); // no active plan: receives rollover
    expect(plan.outflowByDebt.get(1)![1]).toBeCloseTo(200, 5); // active plan: exact amount
    expect(plan.outflowByDebt.get(1)![2]).toBeCloseTo(200, 5);
  });
});

describe('simulateDebtPlan charges & credit limits', () => {
  it('charges a credit card and grows its balance', () => {
    const card = makeDebt({ id: 1, balance: 0, apr: 0, monthly_payment: 0, debt_type: 'credit_card' });
    const plan = simulateDebtPlan([card], 0, 'none', 3, [{ debtId: 1, monthIndex: 0, amount: 500 }]);
    expect(plan.remainingByDebt.get(1)![0]).toBeCloseTo(500, 5);
    expect(plan.chargeOverflow.every((v) => v === 0)).toBe(true);
  });

  it('caps a charge at available credit and spills the rest to cash', () => {
    const card = makeDebt({ id: 1, balance: 800, apr: 0, monthly_payment: 0, credit_limit: 1000, debt_type: 'credit_card' });
    const plan = simulateDebtPlan([card], 0, 'none', 1, [{ debtId: 1, monthIndex: 0, amount: 500 }]);
    // only 200 of the 500 fits under the 1000 limit; 300 spills to cash
    expect(plan.remainingByDebt.get(1)![0]).toBeCloseTo(1000, 5);
    expect(plan.chargeOverflow[0]).toBeCloseTo(300, 5);
  });

  it('flags a card whose balance already exceeds its limit', () => {
    const card = makeDebt({ id: 1, balance: 1200, apr: 0, monthly_payment: 0, credit_limit: 1000, debt_type: 'credit_card' });
    const plan = simulateDebtPlan([card], 0, 'none', 1, []);
    expect(plan.overLimitByDebt.get(1)).toBe(0);
  });

  it('does not flag a pre-payment peak when the charted month-end balance is under the limit', () => {
    const card = makeDebt({ id: 1, balance: 9800, apr: 29.99, monthly_payment: 100, credit_limit: 10000, debt_type: 'credit_card' });
    const schedule = new Map<number, (number | null)[]>([[1, [200]]]);
    const plan = simulateDebtPlan([card], 0, 'avalanche', 1, [], schedule);

    expect(plan.remainingByDebt.get(1)![0]).toBeLessThan(10000);
    expect(plan.overLimitByDebt.get(1)).toBeNull();
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

describe('debtPaidDefault', () => {
  it('is false when no autopay day is set', () => {
    expect(debtPaidDefault(makeDebt({ payment_day: null }))).toBe(false);
  });
  it('is paid once the autopay day has arrived, unpaid while upcoming', () => {
    const now = new Date(2026, 5, 11); // June 11
    expect(debtPaidDefault(makeDebt({ payment_day: 5 }), now)).toBe(true);   // past
    expect(debtPaidDefault(makeDebt({ payment_day: 11 }), now)).toBe(true);  // today
    expect(debtPaidDefault(makeDebt({ payment_day: 20 }), now)).toBe(false); // upcoming
  });
});

describe('simulateDebtPlan paidThisMonth', () => {
  it('skips the current month payment for a paid debt, then resumes', () => {
    const d = makeDebt({ id: 1, balance: 1000, apr: 0, monthly_payment: 200 });
    const plan = simulateDebtPlan([d], 0, 'none', 3, [], undefined, new Set([1]));
    expect(plan.outflowByDebt.get(1)![0]).toBe(0);              // month 0 skipped
    expect(plan.remainingByDebt.get(1)![0]).toBeCloseTo(1000, 5); // balance unchanged in month 0
    expect(plan.outflowByDebt.get(1)![1]).toBeCloseTo(200, 5);  // resumes next month
  });
});
