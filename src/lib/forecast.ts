import type {
  Account,
  Debt,
  Expense,
  ForecastPoint,
  Frequency,
  FundingRule,
  IncomeSource,
  NetWorthPoint,
  SavingsPoint,
  ScheduledPayment,
} from '../types';
import type { DebtCharge, DebtPlan } from './debt';

export const FREQUENCIES: Frequency[] = [
  'weekly',
  'biweekly',
  'monthly',
  'quarterly',
  'annually',
  'one-time',
];

export const FREQUENCY_LABELS: Record<Frequency, string> = {
  weekly: 'Weekly',
  biweekly: 'Bi-weekly',
  monthly: 'Monthly',
  quarterly: 'Quarterly',
  annually: 'Annually',
  'one-time': 'One-time',
};

// Frequencies that arrive as a lump on a period boundary rather than every month.
const LUMP_FREQUENCIES: Frequency[] = ['quarterly', 'annually', 'one-time'];

// Actual cash an income source delivers in a given month (lumps for quarterly/annual/one-time).
// Honors an optional start_date; the frequency cycle is anchored to that start.
function incomeCashAtMonth(src: IncomeSource, monthIndex: number, now: Date): number {
  const startOff = src.start_date ? Math.max(0, monthOffset(src.start_date, now)) : 0;
  if (monthIndex < startOff) return 0;
  const since = monthIndex - startOff;
  const a = src.monthly_amount;
  switch (src.frequency) {
    case 'weekly': return a * (52 / 12);
    case 'biweekly': return a * (26 / 12);
    case 'monthly': return a;
    case 'quarterly': return since % 3 === 0 ? a : 0;
    case 'annually': return since % 12 === 0 ? a : 0;
    case 'one-time': return since === 0 ? a : 0;
  }
}

export function monthlyExpenseTotal(expenses: Expense[]): number {
  return expenses.reduce((sum, e) => sum + e.monthly_amount, 0);
}

// Pre-inflation amount an expense bills in a given month, honoring its frequency
// and optional start/end range (frequency cycle anchored to the start).
function expenseOccurrenceAtMonth(e: Expense, monthIndex: number, now: Date): number {
  const startOff = e.start_date ? Math.max(0, monthOffset(e.start_date, now)) : 0;
  if (monthIndex < startOff) return 0;
  const endOff = e.end_date ? monthOffset(e.end_date, now) : Infinity;
  if (monthIndex > endOff) return 0;
  const since = monthIndex - startOff;
  const a = e.monthly_amount;
  switch (e.frequency ?? 'monthly') {
    case 'weekly': return a * (52 / 12);
    case 'biweekly': return a * (26 / 12);
    case 'monthly': return a;
    case 'quarterly': return since % 3 === 0 ? a : 0;
    case 'annually': return since % 12 === 0 ? a : 0;
    case 'one-time': return since === 0 ? a : 0;
    default: return a;
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function monthLabel(now: Date, offset: number): string {
  const d = new Date(now.getFullYear(), now.getMonth() + offset, 1);
  return d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
}

// Month offset of a YYYY-MM-DD date relative to the current month (0 = this month).
export function monthOffset(dueDate: string, now: Date = new Date()): number {
  const [y, m] = dueDate.split('-').map(Number);
  return (y - now.getFullYear()) * 12 + (m - 1 - now.getMonth());
}

// Cash a scheduled payment draws in a given month, honoring its frequency and start/end window.
function paymentCashAtMonth(p: ScheduledPayment, monthIndex: number, now: Date): number {
  const startOff = monthOffset(p.start_date, now);
  if (monthIndex < startOff) return 0;
  const endOff = p.end_date ? monthOffset(p.end_date, now) : Infinity;
  if (monthIndex > endOff) return 0;

  const since = monthIndex - startOff;
  switch (p.frequency) {
    case 'one-time': return since === 0 ? p.amount : 0;
    case 'weekly': return p.amount * (52 / 12);
    case 'biweekly': return p.amount * (26 / 12);
    case 'monthly': return p.amount;
    case 'quarterly': return since % 3 === 0 ? p.amount : 0;
    case 'annually': return since % 12 === 0 ? p.amount : 0;
  }
}

function fundingRuleValue(rule: FundingRule, amount: number, monthIndex: number, now: Date): number {
  const startOff = rule.start_date ? Math.max(0, monthOffset(rule.start_date, now)) : 0;
  if (monthIndex < startOff) return 0;
  const endOff = rule.end_date ? monthOffset(rule.end_date, now) : Infinity;
  if (monthIndex > endOff) return 0;
  const since = monthIndex - startOff;
  if (rule.alloc_type === 'percent') {
    switch (rule.frequency) {
      case 'quarterly': if (since % 3 !== 0) return 0; break;
      case 'annually': if (since % 12 !== 0) return 0; break;
      case 'one-time': if (since !== 0) return 0; break;
      default: break;
    }
    return amount * (rule.value / 100);
  }
  switch (rule.frequency) {
    case 'weekly': return rule.value * (52 / 12);
    case 'biweekly': return rule.value * (26 / 12);
    case 'monthly': return rule.value;
    case 'quarterly': return since % 3 === 0 ? rule.value : 0;
    case 'annually': return since % 12 === 0 ? rule.value : 0;
    case 'one-time': return since === 0 ? rule.value : 0;
  }
}

interface PaymentFundingPart {
  source_type: 'account' | 'debt';
  source_id: number | null;
  amount: number;
}

interface PaymentFunding {
  cash: number;
  parts: PaymentFundingPart[];
}

function paymentFundingFromSources(
  amount: number,
  monthIndex: number,
  now: Date,
  rules: FundingRule[] | undefined,
  allocs: { source_type: string; source_id: number | null; alloc_type: string; value: number }[] | undefined,
  legacy: () => PaymentFunding,
): PaymentFunding {
  const activeRules = rules ?? [];
  if (activeRules.length > 0) {
    let remaining = amount;
    const parts: PaymentFundingPart[] = [];
    const apply = (rule: FundingRule) => {
      let take = fundingRuleValue(rule, amount, monthIndex, now);
      take = Math.min(take, remaining);
      if (take <= 0) return;
      if ((rule.source_type === 'account' || rule.source_type === 'debt') && rule.source_id != null) {
        parts.push({ source_type: rule.source_type, source_id: rule.source_id, amount: round2(take) });
        remaining -= take;
      }
    };
    for (const r of activeRules) if (r.alloc_type === 'fixed') apply(r);
    for (const r of activeRules) if (r.alloc_type === 'percent') apply(r);
    return {
      cash: round2(parts.filter((p) => p.source_type === 'account').reduce((sum, p) => sum + p.amount, 0) + Math.max(0, remaining)),
      parts,
    };
  }

  const allocations = allocs ?? [];
  if (allocations.length === 0) {
    return legacy();
  }

  let remaining = amount;
  const parts: PaymentFundingPart[] = [];
  const apply = (alloc: { source_type: string; source_id: number | null; alloc_type: string; value: number }) => {
    let take = alloc.alloc_type === 'fixed' ? alloc.value : amount * (alloc.value / 100);
    take = Math.min(take, remaining);
    if (take <= 0) return;
    if ((alloc.source_type === 'account' || alloc.source_type === 'debt') && alloc.source_id != null) {
      parts.push({ source_type: alloc.source_type, source_id: alloc.source_id, amount: round2(take) });
      remaining -= take;
    }
  };

  for (const a of allocations) if (a.alloc_type === 'fixed') apply(a);
  for (const a of allocations) if (a.alloc_type === 'percent') apply(a);
  return {
    cash: round2(parts.filter((p) => p.source_type === 'account').reduce((sum, p) => sum + p.amount, 0) + Math.max(0, remaining)),
    parts,
  };
}

function paymentFundingAtAmount(p: ScheduledPayment, amount: number, monthIndex: number, now: Date): PaymentFunding {
  return paymentFundingFromSources(amount, monthIndex, now, p.funding_rules, p.funding_allocations, () => {
    if (p.funding_source_type === 'debt' && p.funding_source_id != null) {
      return { cash: 0, parts: [{ source_type: 'debt', source_id: p.funding_source_id, amount }] };
    }
    if (p.funding_source_type === 'account' && p.funding_source_id != null) {
      return { cash: amount, parts: [{ source_type: 'account', source_id: p.funding_source_id, amount }] };
    }
    return { cash: amount, parts: [] };
  });
}

interface MonthCashflow {
  income: number;
  incomeLump: number;
  ongoing: number;
  scheduledOut: number;
  scheduledLabel: string;
}

// One month's actual cash movement, shared by both the forecast and savings views
// so the two timelines always agree (savings balance delta === forecast net).
function cashflowAtMonth(
  sources: IncomeSource[],
  ongoingExpense: number,
  payments: ScheduledPayment[],
  monthIndex: number,
  now: Date,
): MonthCashflow {
  let income = 0;
  let incomeLump = 0;
  for (const s of sources) {
    const c = incomeCashAtMonth(s, monthIndex, now);
    income += c;
    if (c > 0 && LUMP_FREQUENCIES.includes(s.frequency)) incomeLump += c;
  }

  let scheduledOut = 0;
  const names: string[] = [];
  for (const p of payments) {
    const c = paymentCashAtMonth(p, monthIndex, now);
    const funding = c > 0 ? paymentFundingAtAmount(p, c, monthIndex, now) : null;
    if (funding && funding.cash > 0) {
      scheduledOut += funding.cash;
      names.push(p.name);
    }
  }

  return {
    income,
    incomeLump,
    ongoing: ongoingExpense,
    scheduledOut,
    scheduledLabel: names.join(', '),
  };
}

// Compound an annual inflation rate (%) to a given month.
function inflationFactor(annualPct: number, monthIndex: number): number {
  if (!annualPct) return 1;
  return Math.pow(1 + annualPct / 100, monthIndex / 12);
}

// Charges that debt-funded future expenses add to their card over the horizon.
export function buildDebtCharges(
  payments: ScheduledPayment[],
  months: number,
  now: Date = new Date(),
): DebtCharge[] {
  const charges: DebtCharge[] = [];
  for (const p of payments) {
    for (let m = 0; m < months; m++) {
      const c = paymentCashAtMonth(p, m, now);
      if (c <= 0) continue;
      const funding = paymentFundingAtAmount(p, c, m, now);
      for (const part of funding.parts) {
        if (part.source_type === 'debt' && part.source_id != null && part.amount > 0) {
          charges.push({ debtId: part.source_id, monthIndex: m, amount: round2(part.amount) });
        }
      }
    }
  }
  return charges;
}

export interface ExpensePlan {
  ongoingCashOut: number[];               // total expense cash outflow each month
  charges: DebtCharge[];                  // expense portions billed to a card
  outByAccount: Map<number, number[]>;    // expense cash outflow per account per month
}

// Resolve each expense's split funding across accounts (cash) and debts (credit lines).
// Fixed allocations apply first, then percentages (of the full bill); the remainder
// falls to the primary account.
export function buildExpensePlan(
  expenses: Expense[],
  accounts: Account[],
  debts: Debt[],
  months: number,
  inflation = 0,
  now: Date = new Date(),
): ExpensePlan {
  const primaryId = (accounts.find((a) => a.is_primary) ?? accounts[0])?.id ?? null;
  const accountIds = new Set(accounts.map((a) => a.id));
  const debtIds = new Set(debts.map((d) => d.id));
  const ongoingCashOut = new Array(months).fill(0);
  const outByAccount = new Map<number, number[]>(accounts.map((a) => [a.id, new Array(months).fill(0)]));
  const charges: DebtCharge[] = [];

  for (let m = 0; m < months; m++) {
    const f = inflationFactor(inflation, m);
    for (const e of expenses) {
      const amount = expenseOccurrenceAtMonth(e, m, now) * f;
      if (amount <= 0) continue;
      const funding = paymentFundingFromSources(amount, m, now, e.funding_rules, e.funding_allocations, () => ({ cash: amount, parts: [] }));
      let allocatedCash = 0;
      for (const part of funding.parts) {
        if (part.source_type === 'debt' && part.source_id != null && debtIds.has(part.source_id)) {
          charges.push({ debtId: part.source_id, monthIndex: m, amount: round2(part.amount) });
        } else if (part.source_type === 'account' && part.source_id != null && accountIds.has(part.source_id)) {
          outByAccount.get(part.source_id)![m] += part.amount;
          ongoingCashOut[m] += part.amount;
          allocatedCash += part.amount;
        }
      }
      const remainder = funding.cash - allocatedCash;
      if (remainder > 0.005 && primaryId != null) {
        outByAccount.get(primaryId)![m] += remainder;
        ongoingCashOut[m] += remainder;
      }
    }
    ongoingCashOut[m] = round2(ongoingCashOut[m]);
  }
  for (const arr of outByAccount.values()) for (let m = 0; m < months; m++) arr[m] = round2(arr[m]);
  return { ongoingCashOut, charges, outByAccount };
}

export function buildForecast(
  sources: IncomeSource[],
  ongoingCashOut: number[],
  payments: ScheduledPayment[],
  debtOutflow: number[],
  months: number,
  now: Date = new Date(),
): ForecastPoint[] {
  return Array.from({ length: months }, (_, i) => {
    const cf = cashflowAtMonth(sources, ongoingCashOut[i] ?? 0, payments, i, now);
    const expensesTotal = cf.ongoing + cf.scheduledOut + (debtOutflow[i] ?? 0);
    return {
      month: i + 1,
      label: monthLabel(now, i),
      income: round2(cf.income),
      expenses: round2(expensesTotal),
      net: round2(cf.income - expensesTotal),
    };
  });
}

export function buildSavings(
  sources: IncomeSource[],
  ongoingCashOut: number[],
  payments: ScheduledPayment[],
  debtOutflow: number[],
  months: number,
  startingBalance: number,
  now: Date = new Date(),
): SavingsPoint[] {
  let balance = startingBalance;
  return Array.from({ length: months }, (_, i) => {
    const cf = cashflowAtMonth(sources, ongoingCashOut[i] ?? 0, payments, i, now);
    const debtOut = debtOutflow[i] ?? 0;
    const net = cf.income - cf.ongoing - cf.scheduledOut - debtOut;
    balance += net;
    return {
      month: i + 1,
      label: monthLabel(now, i),
      income: round2(cf.income),
      incomeLump: round2(cf.incomeLump),
      expenses: round2(cf.ongoing),
      scheduledOut: round2(cf.scheduledOut),
      scheduledLabel: cf.scheduledLabel,
      debtOut: round2(debtOut),
      net: round2(net),
      balance: round2(balance),
    };
  });
}

export interface BreakdownSeries { id: number; name: string; values: number[] }
export interface Breakdown { labels: string[]; total: number[]; series: BreakdownSeries[] }

function labelsFor(months: number, now: Date): string[] {
  return Array.from({ length: months }, (_, i) => monthLabel(now, i));
}

function totalsOf(series: BreakdownSeries[], months: number): number[] {
  return Array.from({ length: months }, (_, i) => round2(series.reduce((sum, s) => sum + (s.values[i] ?? 0), 0)));
}

// Per-income-source monthly cash over the horizon (+ total).
export function buildIncomeBreakdown(sources: IncomeSource[], months: number, now: Date = new Date()): Breakdown {
  const series = sources.map((s) => ({
    id: s.id, name: s.name,
    values: Array.from({ length: months }, (_, i) => round2(incomeCashAtMonth(s, i, now))),
  }));
  return { labels: labelsFor(months, now), total: totalsOf(series, months), series };
}

// Per-expense monthly cost over the horizon, inflation-adjusted (+ total).
export function buildExpenseBreakdown(expenses: Expense[], months: number, inflation = 0, now: Date = new Date()): Breakdown {
  const series = expenses.map((e) => ({
    id: e.id, name: e.name,
    values: Array.from({ length: months }, (_, i) => round2(expenseOccurrenceAtMonth(e, i, now) * inflationFactor(inflation, i))),
  }));
  return { labels: labelsFor(months, now), total: totalsOf(series, months), series };
}

// Per-future-expense amount over the horizon, honoring frequency + window (+ total).
export function buildFutureExpenseBreakdown(payments: ScheduledPayment[], months: number, now: Date = new Date()): Breakdown {
  const series = payments.map((p) => ({
    id: p.id, name: p.name,
    values: Array.from({ length: months }, (_, i) => round2(paymentCashAtMonth(p, i, now))),
  }));
  return { labels: labelsFor(months, now), total: totalsOf(series, months), series };
}

// Per-account balance over time. Income lands in its assigned account (or the primary
// account when unassigned); the primary account bears all general outflows.
// The series sum equals the savings balance, so `total` mirrors the Savings chart.
// Per-account cash outflow from future expenses (account-funded -> that account;
// debt-funded skipped; legacy cash/income -> primary account).
export function buildScheduledOutByAccount(
  payments: ScheduledPayment[],
  accounts: Account[],
  months: number,
  now: Date = new Date(),
): Map<number, number[]> {
  const primaryId = (accounts.find((a) => a.is_primary) ?? accounts[0])?.id ?? null;
  const accountIds = new Set(accounts.map((a) => a.id));
  const map = new Map<number, number[]>(accounts.map((a) => [a.id, new Array(months).fill(0)]));
  for (const p of payments) {
    for (let m = 0; m < months; m++) {
      const c = paymentCashAtMonth(p, m, now);
      if (c <= 0) continue;
      const funding = paymentFundingAtAmount(p, c, m, now);
      let allocatedCash = 0;
      for (const part of funding.parts) {
        if (part.source_type !== 'account' || part.source_id == null || !accountIds.has(part.source_id)) continue;
        map.get(part.source_id)![m] += part.amount;
        allocatedCash += part.amount;
      }
      const remainder = funding.cash - allocatedCash;
      if (remainder > 0.005 && primaryId != null) {
        map.get(primaryId)![m] += remainder;
      }
    }
  }
  for (const arr of map.values()) for (let m = 0; m < months; m++) arr[m] = round2(arr[m]);
  return map;
}

// Per-account cash outflow from debt payments (each debt paid from its account; null -> primary).
export function buildDebtOutByAccount(
  debts: Debt[],
  plan: DebtPlan,
  accounts: Account[],
  now: Date = new Date(),
): Map<number, number[]> {
  const primaryId = (accounts.find((a) => a.is_primary) ?? accounts[0])?.id ?? null;
  const accountIds = new Set(accounts.map((a) => a.id));
  const months = plan.outflow.length;
  const map = new Map<number, number[]>(accounts.map((a) => [a.id, new Array(months).fill(0)]));

  const allocatePayment = (debt: Debt, amount: number, monthIndex: number) => {
    const rules = debt.funding_rules ?? [];
    const allocs = debt.funding_allocations ?? [];
    if (rules.length > 0) {
      const funding = paymentFundingFromSources(amount, monthIndex, now, rules, [], () => ({ cash: amount, parts: [] }));
      let allocated = 0;
      for (const part of funding.parts) {
        if (part.source_type !== 'account' || part.source_id == null || !accountIds.has(part.source_id)) continue;
        map.get(part.source_id)![monthIndex] += part.amount;
        allocated += part.amount;
      }
      const remainder = amount - allocated;
      if (remainder > 0.005 && primaryId != null) map.get(primaryId)![monthIndex] += remainder;
      return;
    }
    if (allocs.length === 0) {
      const acctId = (debt.account_id != null && accountIds.has(debt.account_id)) ? debt.account_id : primaryId;
      if (acctId != null) map.get(acctId)![monthIndex] += amount;
      return;
    }

    let remaining = amount;
    let allocated = 0;
    const apply = (alloc: { source_type: string; source_id: number | null; alloc_type: string; value: number }) => {
      if (alloc.source_type !== 'account' || alloc.source_id == null || !accountIds.has(alloc.source_id)) return;
      let take = alloc.alloc_type === 'fixed' ? alloc.value : amount * (alloc.value / 100);
      take = Math.min(take, remaining);
      if (take <= 0) return;
      map.get(alloc.source_id)![monthIndex] += take;
      remaining -= take;
      allocated += take;
    };

    for (const a of allocs) if (a.alloc_type === 'fixed') apply(a);
    for (const a of allocs) if (a.alloc_type === 'percent') apply(a);
    const remainder = amount - allocated;
    if (remainder > 0.005 && primaryId != null) map.get(primaryId)![monthIndex] += remainder;
  };

  for (const d of debts) {
    const series = plan.outflowByDebt.get(d.id);
    if (!series) continue;
    for (let m = 0; m < months; m++) {
      const amount = series[m] ?? 0;
      if (amount > 0) allocatePayment(d, amount, m);
    }
  }
  for (const arr of map.values()) for (let m = 0; m < months; m++) arr[m] = round2(arr[m]);
  return map;
}

export function buildAccountSeries(
  accounts: Account[],
  sources: IncomeSource[],
  savings: SavingsPoint[],
  expenseOutByAccount: Map<number, number[]>,
  scheduledOutByAccount: Map<number, number[]>,
  debtOutByAccount: Map<number, number[]>,
  now: Date = new Date(),
): Breakdown {
  const months = savings.length;
  const primaryId = (accounts.find((a) => a.is_primary) ?? accounts[0])?.id ?? null;

  const series = accounts.map((acct) => {
    const mine = sources.filter((s) =>
      s.account_id === acct.id || (s.account_id == null && acct.id === primaryId));
    const expenseOut = expenseOutByAccount.get(acct.id);
    const scheduledOut = scheduledOutByAccount.get(acct.id);
    const debtOut = debtOutByAccount.get(acct.id);
    let bal = acct.balance;
    const values = Array.from({ length: months }, (_, i) => {
      const inflow = mine.reduce((sum, s) => sum + incomeCashAtMonth(s, i, now), 0);
      // Each account bears its allocated expense, future-expense, and debt-payment cash.
      const outflow = (expenseOut?.[i] ?? 0) + (scheduledOut?.[i] ?? 0) + (debtOut?.[i] ?? 0);
      bal += inflow - outflow;
      return round2(bal);
    });
    return { id: acct.id, name: acct.name, values };
  });

  return { labels: savings.map((s) => s.label), total: savings.map((s) => s.balance), series };
}

export function buildNetWorth(savings: SavingsPoint[], debtRemaining: number[]): NetWorthPoint[] {
  return savings.map((s, i) => {
    const debt = debtRemaining[i] ?? 0;
    return {
      month: s.month,
      label: s.label,
      cash: s.balance,
      debt: round2(debt),
      netWorth: round2(s.balance - debt),
    };
  });
}
