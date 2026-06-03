import type {
  Expense,
  ForecastPoint,
  Frequency,
  IncomeSource,
  NetWorthPoint,
  SavingsPoint,
  ScheduledPayment,
} from '../types';
import type { DebtCharge } from './debt';

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
function incomeCashAtMonth(src: IncomeSource, monthIndex: number): number {
  const a = src.monthly_amount;
  switch (src.frequency) {
    case 'weekly': return a * (52 / 12);
    case 'biweekly': return a * (26 / 12);
    case 'monthly': return a;
    case 'quarterly': return monthIndex % 3 === 0 ? a : 0;
    case 'annually': return monthIndex % 12 === 0 ? a : 0;
    case 'one-time': return monthIndex === 0 ? a : 0;
  }
}

export function monthlyExpenseTotal(expenses: Expense[]): number {
  return expenses.reduce((sum, e) => sum + e.monthly_amount, 0);
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
    const c = incomeCashAtMonth(s, monthIndex);
    income += c;
    if (c > 0 && LUMP_FREQUENCIES.includes(s.frequency)) incomeLump += c;
  }

  let scheduledOut = 0;
  const names: string[] = [];
  for (const p of payments) {
    // Debt-funded expenses are charged to a card, not paid from cash — they don't dip the balance.
    if (p.funding_source_type === 'debt') continue;
    const c = paymentCashAtMonth(p, monthIndex, now);
    if (c > 0) {
      scheduledOut += c;
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
    if (p.funding_source_type !== 'debt' || p.funding_source_id == null) continue;
    for (let m = 0; m < months; m++) {
      const c = paymentCashAtMonth(p, m, now);
      if (c > 0) charges.push({ debtId: p.funding_source_id, monthIndex: m, amount: c });
    }
  }
  return charges;
}

export function buildForecast(
  sources: IncomeSource[],
  expenses: Expense[],
  payments: ScheduledPayment[],
  debtOutflow: number[],
  months: number,
  inflation = 0,
  now: Date = new Date(),
): ForecastPoint[] {
  const ongoingBase = monthlyExpenseTotal(expenses);
  return Array.from({ length: months }, (_, i) => {
    const ongoing = ongoingBase * inflationFactor(inflation, i);
    const cf = cashflowAtMonth(sources, ongoing, payments, i, now);
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
  expenses: Expense[],
  payments: ScheduledPayment[],
  debtOutflow: number[],
  months: number,
  startingBalance: number,
  inflation = 0,
  now: Date = new Date(),
): SavingsPoint[] {
  const ongoingBase = monthlyExpenseTotal(expenses);
  let balance = startingBalance;
  return Array.from({ length: months }, (_, i) => {
    const ongoing = ongoingBase * inflationFactor(inflation, i);
    const cf = cashflowAtMonth(sources, ongoing, payments, i, now);
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
