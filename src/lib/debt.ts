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

// Default "paid this month" for a debt: paid if its autopay day has already arrived
// this month (day <= today); unpaid if it's still upcoming, or no autopay day is set.
export function debtPaidDefault(debt: Debt, now: Date = new Date()): boolean {
  if (debt.payment_day == null) return false;
  return debt.payment_day <= now.getDate();
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
  interestByDebt: Map<number, number[]>; // per-debt interest accrued each month
  payoffMonthByDebt: Map<number, number | null>; // debt id -> month index it clears (null if not within horizon)
  overLimitByDebt: Map<number, number | null>; // debt id -> first month-end balance above its credit limit (null if never)
  chargeOverflow: number[]; // per month, charge $ aimed at a loan/unknown target -> left UNCOVERED (not paid from cash)
  totalInterest: number;
  debtFreeMonthIndex: number | null; // when the last debt clears
}

// A future expense charged to a debt (credit card / line) at a given month.
export interface DebtCharge {
  debtId: number;
  monthIndex: number;
  amount: number;
  label?: string;                    // source name (for the breakdown tooltip)
  kind?: 'expense' | 'future';       // where the charge came from
}

interface DebtState {
  id: number;
  bal: number;
  rate: number;
  min: number;
  sched: (number | null)[] | null; // funding-plan payment per month; null entry = use min/strategy
  paidMonth: number | null;
  limit: number | null;   // credit limit (null = no cap)
  chargeable: boolean;    // credit cards can be charged; loans cannot
}

// Simulate a combined payoff plan across all debts.
// 'none' = each debt independent (no rollover, extra ignored).
// 'avalanche' = highest APR first; 'snowball' = smallest balance first. Both roll freed
// payments forward and apply the global `extra` to the current target debt.
//
// paymentSchedule (optional) overrides a debt's monthly_payment per month when a
// funding plan exists. A zero entry is authoritative and makes no payment that month.
//
// paidThisMonth (optional) = debt ids already paid this month: they make no payment
// in month 0 (the current balance already reflects it), then resume normally.
export function simulateDebtPlan(
  debts: Debt[],
  extra: number,
  strategy: DebtStrategy,
  months: number,
  charges: DebtCharge[] = [],
  paymentSchedule?: Map<number, (number | null)[]>,
  paidThisMonth?: Set<number>,
): DebtPlan {
  const outflow = new Array(months).fill(0);
  const remaining = new Array(months).fill(0);
  const chargeOverflow = new Array(months).fill(0);
  const payoffMonthByDebt = new Map<number, number | null>();
  const states: DebtState[] = debts.map((d) => ({
    id: d.id,
    bal: d.balance,
    rate: d.apr / 1200,
    min: d.monthly_payment,
    sched: paymentSchedule?.get(d.id) ?? null,
    paidMonth: null,
    limit: d.credit_limit ?? null,
    chargeable: d.debt_type !== 'loan', // default (undefined) treated as chargeable
  }));
  // An active funding plan controls the exact payment and opts that debt out of
  // avalanche/snowball rollover for the month.
  const overrideOf = (d: DebtState, month: number) => d.sched?.[month] ?? null;
  const minOf = (d: DebtState, month: number) => {
    if (month === 0 && paidThisMonth?.has(d.id)) return 0; // already paid this month
    return overrideOf(d, month) ?? d.min;
  };
  const overLimitByDebt = new Map<number, number | null>();
  for (const d of debts) { payoffMonthByDebt.set(d.id, null); overLimitByDebt.set(d.id, null); }
  const stateById = new Map(states.map((s) => [s.id, s]));
  const remainingByDebt = new Map<number, number[]>(states.map((s) => [s.id, new Array(months).fill(0)]));
  const outflowByDebt = new Map<number, number[]>(states.map((s) => [s.id, new Array(months).fill(0)]));
  const interestByDebt = new Map<number, number[]>(states.map((s) => [s.id, new Array(months).fill(0)]));

  // Bucket charges by month for quick lookup.
  const chargesByMonth = new Map<number, DebtCharge[]>();
  for (const c of charges) {
    if (!chargesByMonth.has(c.monthIndex)) chargesByMonth.set(c.monthIndex, []);
    chargesByMonth.get(c.monthIndex)!.push(c);
  }

  let totalInterest = 0;
  let debtFreeMonthIndex: number | null = states.every((d) => d.bal <= 0.005) ? -1 : null;

  for (let m = 0; m < months; m++) {
    // Accrue interest.
    for (const d of states) {
      if (d.bal > 0.005) {
        const interest = d.bal * d.rate;
        d.bal += interest;
        totalInterest += interest;
        interestByDebt.get(d.id)![m] += interest;
      }
    }

    // Apply this month's charges. A valid credit card accepts the full charge even
    // when that takes it over limit; over-limit state is surfaced separately. Only
    // loan/unknown targets are left uncovered.
    for (const c of chargesByMonth.get(m) ?? []) {
      const st = stateById.get(c.debtId);
      if (!st || !st.chargeable) { chargeOverflow[m] += c.amount; continue; }
      st.bal += c.amount;
      if (c.amount > 0 && st.paidMonth !== null && st.bal > 0.005) {
        st.paidMonth = null; // reactivated by a new charge
        payoffMonthByDebt.set(st.id, null);
      }
    }

    if (strategy === 'none') {
      for (const d of states) {
        if (d.bal > 0.005) {
          const pay = Math.min(minOf(d, m), d.bal);
          d.bal -= pay;
          outflow[m] += pay;
          outflowByDebt.get(d.id)![m] += pay;
        }
      }
    } else {
      // Active funding plans pay their exact amount and do not receive or contribute
      // avalanche/snowball rollover. Unscheduled debts share their normal budget.
      let budget = states.filter((d) => overrideOf(d, m) == null).reduce((s, d) => s + d.min, 0) + extra;
      for (const d of states) {
        if (d.bal <= 0.005) continue;
        const override = overrideOf(d, m);
        if (override != null) {
          const pay = Math.min(override, d.bal);
          d.bal -= pay;
          outflow[m] += pay;
          outflowByDebt.get(d.id)![m] += pay;
        } else if (budget > 0) {
          const pay = Math.min(d.min, d.bal, budget);
          d.bal -= pay;
          budget -= pay;
          outflow[m] += pay;
          outflowByDebt.get(d.id)![m] += pay;
        }
      }
      // Throw whatever's left at the target debt(s) in priority order.
      const order = [...states].filter((d) => d.bal > 0.005 && overrideOf(d, m) == null).sort((a, b) =>
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
      // Warnings use the same post-payment month-end balance shown by the chart.
      if (d.chargeable && d.limit != null && d.bal > d.limit + 0.005 && overLimitByDebt.get(d.id) == null) {
        overLimitByDebt.set(d.id, m);
      }
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
    chargeOverflow[m] = round2(chargeOverflow[m]);
    for (const d of states) { outflowByDebt.get(d.id)![m] = round2(outflowByDebt.get(d.id)![m]); interestByDebt.get(d.id)![m] = round2(interestByDebt.get(d.id)![m]); }
    if (debtFreeMonthIndex === null && states.every((d) => d.bal <= 0.005)) {
      debtFreeMonthIndex = m;
    }
  }

  return {
    outflow,
    outflowByDebt,
    remaining,
    remainingByDebt,
    interestByDebt,
    chargeOverflow,
    payoffMonthByDebt,
    overLimitByDebt,
    totalInterest: round2(totalInterest),
    debtFreeMonthIndex,
  };
}
