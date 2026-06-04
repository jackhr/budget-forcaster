import type { Debt } from '../types';

const MAX_MONTHS = 1200; // 100-year safety cap

export interface DebtSimulation {
  payments: number[];        // actual payment each month until payoff (empty if neverPaysOff)
  totalInterest: number;     // total interest over the life (Infinity if neverPaysOff)
  payoffMonthIndex: number | null; // 0-based month offset of final payment; null if never
  neverPaysOff: boolean;
}

// Simulate paying down a debt with a fixed monthly payment.
export function simulateDebt(balance: number, apr: number, monthlyPayment: number): DebtSimulation {
  const monthlyRate = apr / 1200;

  if (balance <= 0) {
    return { payments: [], totalInterest: 0, payoffMonthIndex: null, neverPaysOff: false };
  }

  // If the payment can't even cover the first month's interest, the balance never shrinks.
  const firstInterest = balance * monthlyRate;
  if (monthlyPayment <= 0 || (monthlyRate > 0 && monthlyPayment <= firstInterest)) {
    return { payments: [], totalInterest: Infinity, payoffMonthIndex: null, neverPaysOff: true };
  }

  const payments: number[] = [];
  let bal = balance;
  let totalInterest = 0;

  for (let m = 0; m < MAX_MONTHS; m++) {
    const interest = bal * monthlyRate;
    bal += interest;
    totalInterest += interest;
    const pay = Math.min(monthlyPayment, bal);
    bal -= pay;
    payments.push(round2(pay));
    if (bal <= 0.005) {
      return { payments, totalInterest: round2(totalInterest), payoffMonthIndex: m, neverPaysOff: false };
    }
  }
  // Shouldn't reach here given the never-pays-off guard, but stay safe.
  return { payments, totalInterest: round2(totalInterest), payoffMonthIndex: null, neverPaysOff: true };
}

export interface DebtSummary {
  monthsToPayoff: number | null;
  payoffMonthIndex: number | null;
  totalInterest: number | null;
  neverPaysOff: boolean;
  utilization: number | null; // 0..1, only when a credit limit is set
}

export function summarizeDebt(debt: Debt): DebtSummary {
  const sim = simulateDebt(debt.balance, debt.apr, debt.monthly_payment);
  return {
    monthsToPayoff: sim.payoffMonthIndex == null ? null : sim.payoffMonthIndex + 1,
    payoffMonthIndex: sim.payoffMonthIndex,
    totalInterest: sim.neverPaysOff ? null : sim.totalInterest,
    neverPaysOff: sim.neverPaysOff,
    utilization: debt.credit_limit && debt.credit_limit > 0 ? debt.balance / debt.credit_limit : null,
  };
}

// Combined debt outflow per month across the forecast horizon (payments stop at payoff).
export function debtOutflowTotals(debts: Debt[], months: number): number[] {
  const totals = new Array(months).fill(0);
  for (const d of debts) {
    const sim = simulateDebt(d.balance, d.apr, d.monthly_payment);
    if (sim.neverPaysOff) {
      for (let m = 0; m < months; m++) totals[m] += d.monthly_payment;
    } else {
      const len = Math.min(months, sim.payments.length);
      for (let m = 0; m < len; m++) totals[m] += sim.payments[m];
    }
  }
  return totals;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export type DebtStrategy = 'none' | 'avalanche' | 'snowball';

export interface DebtPlan {
  outflow: number[];   // total debt payment each month
  outflowByDebt: Map<number, number[]>; // per-debt payment each month (for pay-from attribution)
  remaining: number[]; // total remaining balance at each month-end (for net worth)
  remainingByDebt: Map<number, number[]>; // per-debt remaining balance each month (for breakdown)
  payoffMonthByDebt: Map<number, number | null>; // debt id -> month index it clears (null if not within horizon)
  totalInterest: number;
  debtFreeMonthIndex: number | null; // when the last debt clears
}

// A future expense charged to a debt (credit card / line) at a given month.
export interface DebtCharge {
  debtId: number;
  monthIndex: number;
  amount: number;
}

interface DebtState {
  id: number;
  bal: number;
  rate: number;
  min: number;
  paidMonth: number | null;
}

// Simulate a combined payoff plan across all debts.
// 'none' = each debt independent (no rollover, extra ignored).
// 'avalanche' = highest APR first; 'snowball' = smallest balance first. Both roll freed
// payments forward and apply the global `extra` to the current target debt.
export function simulateDebtPlan(
  debts: Debt[],
  extra: number,
  strategy: DebtStrategy,
  months: number,
  charges: DebtCharge[] = [],
): DebtPlan {
  const outflow = new Array(months).fill(0);
  const remaining = new Array(months).fill(0);
  const payoffMonthByDebt = new Map<number, number | null>();
  const states: DebtState[] = debts.map((d) => ({
    id: d.id,
    bal: d.balance,
    rate: d.apr / 1200,
    min: d.monthly_payment,
    paidMonth: null,
  }));
  for (const d of debts) payoffMonthByDebt.set(d.id, null);
  const stateById = new Map(states.map((s) => [s.id, s]));
  const remainingByDebt = new Map<number, number[]>(states.map((s) => [s.id, new Array(months).fill(0)]));
  const outflowByDebt = new Map<number, number[]>(states.map((s) => [s.id, new Array(months).fill(0)]));

  // Bucket charges by month for quick lookup.
  const chargesByMonth = new Map<number, DebtCharge[]>();
  for (const c of charges) {
    if (!chargesByMonth.has(c.monthIndex)) chargesByMonth.set(c.monthIndex, []);
    chargesByMonth.get(c.monthIndex)!.push(c);
  }

  const baseBudget = states.reduce((s, d) => s + d.min, 0) + (strategy === 'none' ? 0 : extra);
  let totalInterest = 0;
  let debtFreeMonthIndex: number | null = states.every((d) => d.bal <= 0.005) ? -1 : null;

  for (let m = 0; m < months; m++) {
    // Accrue interest.
    for (const d of states) {
      if (d.bal > 0.005) {
        const interest = d.bal * d.rate;
        d.bal += interest;
        totalInterest += interest;
      }
    }

    // Apply this month's charges (future expenses billed to a card).
    for (const c of chargesByMonth.get(m) ?? []) {
      const st = stateById.get(c.debtId);
      if (st) {
        st.bal += c.amount;
        if (st.paidMonth !== null && st.bal > 0.005) {
          st.paidMonth = null; // reactivated by a new charge
          payoffMonthByDebt.set(st.id, null);
        }
      }
    }

    if (strategy === 'none') {
      for (const d of states) {
        if (d.bal > 0.005) {
          const pay = Math.min(d.min, d.bal);
          d.bal -= pay;
          outflow[m] += pay;
          outflowByDebt.get(d.id)![m] += pay;
        }
      }
    } else {
      let budget = baseBudget;
      // Pay minimums on every active debt.
      for (const d of states) {
        if (d.bal > 0.005 && budget > 0) {
          const pay = Math.min(d.min, d.bal, budget);
          d.bal -= pay;
          budget -= pay;
          outflow[m] += pay;
          outflowByDebt.get(d.id)![m] += pay;
        }
      }
      // Throw whatever's left at the target debt(s) in priority order.
      const order = [...states].filter((d) => d.bal > 0.005).sort((a, b) =>
        strategy === 'avalanche' ? b.rate - a.rate : a.bal - b.bal,
      );
      for (const d of order) {
        if (budget <= 0) break;
        const pay = Math.min(budget, d.bal);
        d.bal -= pay;
        budget -= pay;
        outflow[m] += pay;
        outflowByDebt.get(d.id)![m] += pay;
      }
    }

    // Record payoffs and remaining balance.
    for (const d of states) {
      if (d.bal <= 0.005 && d.paidMonth === null) {
        d.paidMonth = m;
        payoffMonthByDebt.set(d.id, m);
      }
      const bal = Math.max(0, d.bal);
      remaining[m] += bal;
      remainingByDebt.get(d.id)![m] = round2(bal);
    }
    outflow[m] = round2(outflow[m]);
    remaining[m] = round2(remaining[m]);
    for (const d of states) outflowByDebt.get(d.id)![m] = round2(outflowByDebt.get(d.id)![m]);
    if (debtFreeMonthIndex === null && states.every((d) => d.bal <= 0.005)) {
      debtFreeMonthIndex = m;
    }
  }

  return {
    outflow,
    outflowByDebt,
    remaining,
    remainingByDebt,
    payoffMonthByDebt,
    totalInterest: round2(totalInterest),
    debtFreeMonthIndex,
  };
}
