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
