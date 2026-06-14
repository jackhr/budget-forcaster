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
  liquidityChanges: LiquidityChange[];
}

export interface LiquidityChange {
  key: string;
  name: string;
  kind: 'account' | 'card';
  amount: number;
}

export interface LiquiditySeries {
  key: string;
  name: string;
  kind: 'total' | 'accounts' | 'account' | 'card';
  values: number[];
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
  liquidity: LiquiditySeries[];
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

function payrollDateForMonthDay(year: number, month: number, day: number): Date {
  const date = dateForMonthDay(year, month, day);
  if (date.getDay() === 6) date.setDate(date.getDate() - 1);
  if (date.getDay() === 0) date.setDate(date.getDate() - 2);
  return date;
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

  if (frequency === 'semimonthly') {
    return [dateForMonthDay(year, month, fallbackDay), dateForMonthDay(year, month, 31)]
      .filter((date, index, dates) => index === 0 || date.getTime() !== dates[0].getTime())
      .filter((date) => date >= start && (!end || date <= end))
      .map((date) => ({ date, specified }));
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

function incomeOccurrenceDates(item: IncomeSource, year: number, month: number): { date: Date; specified: boolean; status: 'expected' | 'received' | 'detected' | 'skipped'; amount: number }[] {
  if (item.frequency !== 'semimonthly') {
    return occurrenceDates(item.frequency, item.start_date, null, year, month)
      .map((occurrence) => ({ ...occurrence, status: 'expected' as const, amount: item.monthly_amount }));
  }
  const defaults = [
    payrollDateForMonthDay(year, month, item.payday_1 ?? 15),
    payrollDateForMonthDay(year, month, item.payday_2 ?? 31),
  ].filter((date, index, dates) => index === 0 || date.getTime() !== dates[0].getTime());
  const overrides = new Map((item.occurrences ?? []).map((occurrence) => [occurrence.scheduled_date, occurrence]));
  return defaults
    .filter((date) => !item.start_date || isoDate(date).slice(0, 7) >= item.start_date.slice(0, 7))
    .map((date) => {
      const override = overrides.get(isoDate(date));
      return {
        date: override ? parseDate(override.occurrence_date) : date,
        specified: true,
        status: override?.status ?? 'expected',
        amount: override?.status === 'detected' && override.transaction_amount != null ? override.transaction_amount : item.monthly_amount,
      };
    });
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

function sourceChange(sourceType: 'account' | 'debt', sourceId: number | null, amount: number, accounts: Account[], debts: Debt[]): LiquidityChange | null {
  if (sourceId == null) return null;
  if (sourceType === 'account') {
    const account = accounts.find((item) => item.id === sourceId);
    return account ? { key: `account:${account.id}`, name: account.name, kind: 'account', amount: round2(amount) } : null;
  }
  const debt = debts.find((item) => item.id === sourceId && item.debt_type === 'credit_card' && item.credit_limit != null);
  return debt ? { key: `card:${debt.id}`, name: debt.name, kind: 'card', amount: round2(amount) } : null;
}

function fundingChanges(
  amount: number,
  rules: FundingRule[],
  allocations: { source_type: 'account' | 'debt'; source_id: number | null; alloc_type: string; value: number }[],
  accounts: Account[],
  debts: Debt[],
  fallbackType: 'account' | 'debt',
  fallbackId: number | null,
): LiquidityChange[] {
  const sources = rules.length > 0 ? rules : allocations;
  const changes: LiquidityChange[] = [];
  let remaining = amount;
  const apply = (source: { source_type: 'account' | 'debt'; source_id: number | null; alloc_type: string; value: number }) => {
    const requested = source.alloc_type === 'fixed' ? source.value : amount * Math.min(100, source.value) / 100;
    const used = Math.min(requested, remaining);
    const change = sourceChange(source.source_type, source.source_id, -used, accounts, debts);
    if (change && used > 0.005) {
      changes.push(change);
      remaining -= used;
    }
  };
  for (const source of sources) if (source.alloc_type === 'fixed') apply(source);
  for (const source of sources) if (source.alloc_type === 'percent') apply(source);
  const fallback = sourceChange(fallbackType, fallbackId, -remaining, accounts, debts);
  if (fallback && remaining > 0.005) changes.push(fallback);
  return changes;
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
  liquidityStart?: Map<string, number>,
): MonthBreakdown {
  const target = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1);
  const year = target.getFullYear();
  const month = target.getMonth();
  const days = new Date(year, month + 1, 0).getDate();
  const events: MonthObligation[] = [];
  const primary = accounts.find((account) => account.is_primary) ?? accounts[0];

  const push = (
    key: string, date: Date, dateSpecified: boolean, name: string, kind: MonthObligationKind,
    direction: 'in' | 'out', amount: number, detail: string, paid = false, liquidityChanges: LiquidityChange[] = [],
  ) => {
    if (amount <= 0.005) return;
    events.push({ key, day: date.getDate(), date: isoDate(date), name, kind, direction, amount: round2(amount), detail, paid, dateSpecified, liquidityChanges });
  };

  for (const item of income) {
    for (const occurrence of incomeOccurrenceDates(item, year, month)) {
      if (occurrence.status === 'skipped') continue;
      const account = accounts.find((candidate) => candidate.id === item.account_id) ?? accounts.find((candidate) => candidate.is_primary) ?? accounts[0];
      const change = sourceChange('account', account?.id ?? null, occurrence.amount, accounts, debts);
      const received = occurrence.status === 'received' || occurrence.status === 'detected';
      push(
        `income:${item.id}:${isoDate(occurrence.date)}`, occurrence.date, occurrence.specified, item.name, 'income', 'in', occurrence.amount,
        received ? `${occurrence.status === 'detected' ? 'Detected deposit' : 'Received'} in ${account?.name ?? 'primary account'}` : `to ${account?.name ?? 'primary account'}`,
        received, change ? [change] : [],
      );
    }
  }

  for (const item of expenses) {
    for (const occurrence of occurrenceDates(item.frequency, item.start_date, item.end_date, year, month)) {
      const paid = monthOffset === 0 && !!paidExpenseIds?.has(item.id);
      const sources = fundingSources(item.funding_rules, item.funding_allocations, accounts, debts, primary?.name ?? 'primary account');
      const changes = fundingChanges(item.monthly_amount, item.funding_rules, item.funding_allocations, accounts, debts, 'account', primary?.id ?? null);
      push(`expense:${item.id}:${isoDate(occurrence.date)}`, occurrence.date, occurrence.specified, item.name, 'expense', 'out', item.monthly_amount, `from ${sources}`, paid, changes);
    }
  }

  for (const item of future) {
    for (const occurrence of occurrenceDates(item.frequency, item.start_date, item.end_date, year, month)) {
      let fallback = primary?.name ?? 'primary account';
      let fallbackType: 'account' | 'debt' = 'account';
      let fallbackId: number | null = primary?.id ?? null;
      if (item.funding_source_type === 'account') fallback = accounts.find((account) => account.id === item.funding_source_id)?.name ?? fallback;
      if (item.funding_source_type === 'account') fallbackId = item.funding_source_id;
      if (item.funding_source_type === 'debt') {
        fallback = debts.find((debt) => debt.id === item.funding_source_id)?.name ?? fallback;
        fallbackType = 'debt';
        fallbackId = item.funding_source_id;
      }
      const sources = fundingSources(item.funding_rules, item.funding_allocations, accounts, debts, fallback);
      const changes = fundingChanges(item.amount, item.funding_rules, item.funding_allocations, accounts, debts, fallbackType, fallbackId);
      push(`future:${item.id}:${isoDate(occurrence.date)}`, occurrence.date, occurrence.specified, item.name, 'future', 'out', item.amount, `from ${sources}`, false, changes);
    }
  }

  for (const debt of debts) {
    const paid = monthOffset === 0 && !!paidDebtIds?.has(debt.id);
    if (debt.funding_rules.length > 0) {
      debt.funding_rules.forEach((rule, ruleIndex) => {
        const amount = rule.alloc_type === 'fixed' ? rule.value : debt.monthly_payment * Math.min(100, rule.value) / 100;
        for (const occurrence of occurrenceDates(rule.frequency, rule.start_date, rule.end_date, year, month, debt.payment_day ?? 1)) {
          const changes: LiquidityChange[] = [];
          const source = sourceChange(rule.source_type, rule.source_id, -amount, accounts, debts);
          if (source) changes.push(source);
          const card = sourceChange('debt', debt.id, amount, accounts, debts);
          if (card) changes.push(card);
          push(`debt:${debt.id}:rule:${ruleIndex}:${isoDate(occurrence.date)}`, occurrence.date, occurrence.specified || debt.payment_day != null, debt.name, 'debt', 'out', amount, `from ${sourceName(rule, accounts, debts)}`, paid, changes);
        }
      });
    } else {
      for (const occurrence of occurrenceDates('monthly', null, null, year, month, debt.payment_day ?? 1)) {
        const changes: LiquidityChange[] = [];
        const sourceId = debt.funding_allocations[0]?.source_id ?? debt.account_id ?? primary?.id ?? null;
        const source = sourceChange('account', sourceId, -debt.monthly_payment, accounts, debts);
        if (source) changes.push(source);
        const card = sourceChange('debt', debt.id, debt.monthly_payment, accounts, debts);
        if (card) changes.push(card);
        push(`debt:${debt.id}:${isoDate(occurrence.date)}`, occurrence.date, debt.payment_day != null, debt.name, 'debt', 'out', debt.monthly_payment, `from ${defaultDebtSource(debt, accounts)}`, paid, changes);
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

  const liquidity: LiquiditySeries[] = [
    ...accounts.map((account) => ({ key: `account:${account.id}`, name: account.name, kind: 'account' as const, start: account.balance, max: Infinity })),
    ...debts.filter((debt) => debt.debt_type === 'credit_card' && debt.credit_limit != null).map((debt) => ({
      key: `card:${debt.id}`, name: debt.name, kind: 'card' as const, start: Math.max(0, debt.credit_limit! - debt.balance), max: debt.credit_limit!,
    })),
  ].map((source) => {
    // Current balances are an as-of-today snapshot. Reconstruct this month's
    // opening value so past obligations are not applied twice. Future months may
    // instead receive the prior projected month's ending values.
    const changesThroughToday = monthOffset === 0 && !liquidityStart
      ? events.filter((event) => event.day <= now.getDate()).flatMap((event) => event.liquidityChanges)
        .filter((change) => change.key === source.key).reduce((sum, change) => sum + change.amount, 0)
      : 0;
    let value = liquidityStart?.get(source.key) ?? (source.start - changesThroughToday);
    const values = daily.map((point) => {
      value += point.events.flatMap((event) => event.liquidityChanges).filter((change) => change.key === source.key).reduce((sum, change) => sum + change.amount, 0);
      return round2(Math.max(0, Math.min(source.max, value)));
    });
    return { key: source.key, name: source.name, kind: source.kind, values };
  });
  liquidity.unshift({
    key: 'accounts', name: 'All cash accounts', kind: 'accounts',
    values: daily.map((_, index) => round2(liquidity.filter((source) => source.kind === 'account').reduce((sum, source) => sum + source.values[index], 0))),
  });
  liquidity.unshift({
    key: 'total', name: 'All liquidity', kind: 'total',
    values: daily.map((_, index) => round2(liquidity.filter((source) => source.kind === 'account' || source.kind === 'card').reduce((sum, source) => sum + source.values[index], 0))),
  });

  return {
    year, month, label: target.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }), days, events, daily,
    totalIn: moneyIn, totalOut: moneyOut, net: round2(moneyIn - moneyOut), liquidity,
  };
}
