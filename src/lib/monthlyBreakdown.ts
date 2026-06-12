import type { Account, Debt, Expense, Frequency, FundingRule, IncomeSource, ScheduledPayment } from '../types';

export type MonthObligationKind = 'income' | 'expense' | 'future' | 'debt';

export interface MonthObligation {
  key: string;
  day: number;
  date: string;
  name: string;
  kind: MonthObligationKind;
  direction: 'in' | 'out';
  amount: number;
  detail: string;
  paid: boolean;
  dateSpecified: boolean;
}

export interface DailyMonthPoint {
  day: number;
  label: string;
  moneyIn: number;
  moneyOut: number;
  net: number;
  dailyIn: number;
  dailyOut: number;
  events: MonthObligation[];
}

export interface MonthBreakdown {
  year: number;
  month: number;
  label: string;
  days: number;
  events: MonthObligation[];
  daily: DailyMonthPoint[];
  totalIn: number;
  totalOut: number;
  net: number;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function parseDate(value: string): Date {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function isoDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function dateForMonthDay(year: number, month: number, day: number): Date {
  return new Date(year, month, Math.min(Math.max(1, day), new Date(year, month + 1, 0).getDate()));
}

function addMonths(date: Date, months: number): Date {
  return dateForMonthDay(date.getFullYear(), date.getMonth() + months, date.getDate());
}

function monthDifference(from: Date, to: Date): number {
  return (to.getFullYear() - from.getFullYear()) * 12 + to.getMonth() - from.getMonth();
}

function occurrenceDates(
  frequency: Frequency,
  startDate: string | null,
  endDate: string | null,
  year: number,
  month: number,
  fallbackDay = 1,
): { date: Date; specified: boolean }[] {
  const monthStart = new Date(year, month, 1);
  const monthEnd = new Date(year, month + 1, 0);
  const specified = !!startDate;
  const start = startDate ? parseDate(startDate) : dateForMonthDay(year, month, fallbackDay);
  const end = endDate ? parseDate(endDate) : null;
  if (start > monthEnd || (end && end < monthStart)) return [];

  if (frequency === 'weekly' || frequency === 'biweekly') {
    const step = frequency === 'weekly' ? 7 : 14;
    const first = new Date(start);
    if (first < monthStart) {
      const elapsed = Math.floor((monthStart.getTime() - first.getTime()) / 86400000);
      first.setDate(first.getDate() + Math.ceil(elapsed / step) * step);
    }
    const dates: { date: Date; specified: boolean }[] = [];
    for (const date = first; date <= monthEnd && (!end || date <= end); date.setDate(date.getDate() + step)) {
      dates.push({ date: new Date(date), specified });
    }
    return dates;
  }

  if (frequency === 'one-time') {
    return start >= monthStart && start <= monthEnd && (!end || start <= end) ? [{ date: start, specified }] : [];
  }

  const difference = monthDifference(start, monthStart);
  const interval = frequency === 'monthly' ? 1 : frequency === 'quarterly' ? 3 : 12;
  if (difference < 0 || difference % interval !== 0) return [];
  const occurrence = addMonths(start, difference);
  return occurrence <= monthEnd && (!end || occurrence <= end) ? [{ date: occurrence, specified }] : [];
}

function sourceName(rule: FundingRule, accounts: Account[], debts: Debt[]): string {
  if (rule.source_type === 'account') return accounts.find((account) => account.id === rule.source_id)?.name ?? 'Unknown account';
  return debts.find((debt) => debt.id === rule.source_id)?.name ?? 'Unknown card';
}

function defaultDebtSource(debt: Debt, accounts: Account[]): string {
  const primary = accounts.find((account) => account.is_primary) ?? accounts[0];
  if (debt.funding_allocations.length > 1) return `${debt.funding_allocations.length} accounts`;
  const sourceId = debt.funding_allocations[0]?.source_id ?? debt.account_id ?? primary?.id;
  return accounts.find((account) => account.id === sourceId)?.name ?? 'Primary account';
}

function fundingSources(
  rules: FundingRule[],
  allocations: { source_type: 'account' | 'debt'; source_id: number | null }[],
  accounts: Account[],
  debts: Debt[],
  fallback: string,
): string {
  const sources = rules.length > 0 ? rules : allocations;
  const names = sources.map((source) => {
    if (source.source_type === 'account') return accounts.find((account) => account.id === source.source_id)?.name;
    return debts.find((debt) => debt.id === source.source_id)?.name;
  }).filter((name): name is string => !!name);
  return [...new Set(names)].join(' + ') || fallback;
}

export function buildMonthBreakdown(
  income: IncomeSource[],
  expenses: Expense[],
  future: ScheduledPayment[],
  debts: Debt[],
  accounts: Account[],
  monthOffset: number,
  now: Date = new Date(),
  paidDebtIds?: Set<number>,
  paidExpenseIds?: Set<number>,
): MonthBreakdown {
  const target = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1);
  const year = target.getFullYear();
  const month = target.getMonth();
  const days = new Date(year, month + 1, 0).getDate();
  const events: MonthObligation[] = [];

  const push = (
    key: string, date: Date, dateSpecified: boolean, name: string, kind: MonthObligationKind,
    direction: 'in' | 'out', amount: number, detail: string, paid = false,
  ) => {
    if (amount <= 0.005) return;
    events.push({ key, day: date.getDate(), date: isoDate(date), name, kind, direction, amount: round2(amount), detail, paid, dateSpecified });
  };

  for (const item of income) {
    for (const occurrence of occurrenceDates(item.frequency, item.start_date, null, year, month)) {
      const account = accounts.find((candidate) => candidate.id === item.account_id) ?? accounts.find((candidate) => candidate.is_primary) ?? accounts[0];
      push(`income:${item.id}:${isoDate(occurrence.date)}`, occurrence.date, occurrence.specified, item.name, 'income', 'in', item.monthly_amount, `to ${account?.name ?? 'primary account'}`);
    }
  }

  for (const item of expenses) {
    for (const occurrence of occurrenceDates(item.frequency, item.start_date, item.end_date, year, month)) {
      const paid = monthOffset === 0 && !!paidExpenseIds?.has(item.id);
      const primary = accounts.find((account) => account.is_primary) ?? accounts[0];
      const sources = fundingSources(item.funding_rules, item.funding_allocations, accounts, debts, primary?.name ?? 'primary account');
      push(`expense:${item.id}:${isoDate(occurrence.date)}`, occurrence.date, occurrence.specified, item.name, 'expense', 'out', item.monthly_amount, `from ${sources}`, paid);
    }
  }

  for (const item of future) {
    for (const occurrence of occurrenceDates(item.frequency, item.start_date, item.end_date, year, month)) {
      const primary = accounts.find((account) => account.is_primary) ?? accounts[0];
      let fallback = primary?.name ?? 'primary account';
      if (item.funding_source_type === 'account') fallback = accounts.find((account) => account.id === item.funding_source_id)?.name ?? fallback;
      if (item.funding_source_type === 'debt') fallback = debts.find((debt) => debt.id === item.funding_source_id)?.name ?? fallback;
      const sources = fundingSources(item.funding_rules, item.funding_allocations, accounts, debts, fallback);
      push(`future:${item.id}:${isoDate(occurrence.date)}`, occurrence.date, occurrence.specified, item.name, 'future', 'out', item.amount, `from ${sources}`);
    }
  }

  for (const debt of debts) {
    const paid = monthOffset === 0 && !!paidDebtIds?.has(debt.id);
    if (debt.funding_rules.length > 0) {
      debt.funding_rules.forEach((rule, ruleIndex) => {
        const amount = rule.alloc_type === 'fixed' ? rule.value : debt.monthly_payment * Math.min(100, rule.value) / 100;
        for (const occurrence of occurrenceDates(rule.frequency, rule.start_date, rule.end_date, year, month, debt.payment_day ?? 1)) {
          push(`debt:${debt.id}:rule:${ruleIndex}:${isoDate(occurrence.date)}`, occurrence.date, occurrence.specified || debt.payment_day != null, debt.name, 'debt', 'out', amount, `from ${sourceName(rule, accounts, debts)}`, paid);
        }
      });
    } else {
      for (const occurrence of occurrenceDates('monthly', null, null, year, month, debt.payment_day ?? 1)) {
        push(`debt:${debt.id}:${isoDate(occurrence.date)}`, occurrence.date, debt.payment_day != null, debt.name, 'debt', 'out', debt.monthly_payment, `from ${defaultDebtSource(debt, accounts)}`, paid);
      }
    }
  }

  events.sort((a, b) => a.day - b.day || (a.direction === b.direction ? b.amount - a.amount : a.direction === 'in' ? -1 : 1));
  let moneyIn = 0;
  let moneyOut = 0;
  const daily = Array.from({ length: days }, (_, index) => {
    const day = index + 1;
    // Monthly Obligations is a combined history + forecast view. Paid items stay
    // in the timeline and totals; their paid flag only communicates status.
    const dayEvents = events.filter((event) => event.day === day);
    const dailyIn = round2(dayEvents.filter((event) => event.direction === 'in').reduce((sum, event) => sum + event.amount, 0));
    const dailyOut = round2(dayEvents.filter((event) => event.direction === 'out').reduce((sum, event) => sum + event.amount, 0));
    moneyIn = round2(moneyIn + dailyIn);
    moneyOut = round2(moneyOut + dailyOut);
    return { day, label: String(day), moneyIn, moneyOut, net: round2(moneyIn - moneyOut), dailyIn, dailyOut, events: dayEvents };
  });

  return {
    year, month, label: target.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }), days, events, daily,
    totalIn: moneyIn, totalOut: moneyOut, net: round2(moneyIn - moneyOut),
  };
}
