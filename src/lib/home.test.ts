import { describe, it, expect } from 'vitest';
import { findRunwayRisk, findCashLow, upcomingEvents, totalsFor, whenLabel } from './home';
import type { Breakdown } from './forecast';
import type { MonthBreakdown, MonthObligation } from './monthlyBreakdown';

const NOW = new Date(2026, 10, 15); // Nov 15 2026

function breakdown(series: { id: number; name: string; values: number[] }[]): Breakdown {
  const months = series[0]?.values.length ?? 0;
  return {
    labels: Array.from({ length: months }, (_, i) => `M${i}`),
    total: Array.from({ length: months }, (_, i) => series.reduce((s, x) => s + x.values[i], 0)),
    series,
  };
}

describe('findRunwayRisk', () => {
  it('finds the first month an account goes negative', () => {
    const bd = breakdown([
      { id: 1, name: 'Checking', values: [1000, 500, -200, -900] },
      { id: 2, name: 'Savings', values: [5000, 5000, 5000, 5000] },
    ]);
    expect(findRunwayRisk(bd)).toEqual({
      accountName: 'Checking', amount: -200, monthIndex: 2, monthLabel: 'M2',
    });
  });

  it('prefers the earliest dip over the deepest one', () => {
    const bd = breakdown([
      { id: 1, name: 'Deep later', values: [100, 100, -9000] },
      { id: 2, name: 'Shallow sooner', values: [100, -50, -60] },
    ]);
    expect(findRunwayRisk(bd)?.accountName).toBe('Shallow sooner');
  });

  it('names the worst account when two dip in the same month', () => {
    const bd = breakdown([
      { id: 1, name: 'A little short', values: [100, -20] },
      { id: 2, name: 'Badly short', values: [100, -800] },
    ]);
    expect(findRunwayRisk(bd)?.accountName).toBe('Badly short');
  });

  it('returns null when every account stays positive', () => {
    expect(findRunwayRisk(breakdown([{ id: 1, name: 'Checking', values: [10, 20, 30] }]))).toBeNull();
  });

  it('is not fooled by a healthy total hiding one overdrawn account', () => {
    const bd = breakdown([
      { id: 1, name: 'Checking', values: [-500, -500] },
      { id: 2, name: 'Savings', values: [9000, 9000] },
    ]);
    expect(bd.total[0]).toBe(8500); // looks fine in aggregate
    expect(findRunwayRisk(bd)?.accountName).toBe('Checking');
  });
});

describe('findCashLow', () => {
  it('finds the low-water mark of total cash', () => {
    const bd = breakdown([{ id: 1, name: 'Checking', values: [900, 400, 650, 1200] }]);
    expect(findCashLow(bd)).toEqual({ amount: 400, monthIndex: 1, monthLabel: 'M1' });
  });

  it('returns null with no months', () => {
    expect(findCashLow({ labels: [], total: [], series: [] })).toBeNull();
  });
});

function event(over: Partial<MonthObligation> & { date: string }): MonthObligation {
  return {
    key: over.date + (over.name ?? ''),
    day: Number(over.date.slice(8)),
    name: 'Thing',
    kind: 'expense',
    direction: 'out',
    amount: 100,
    detail: '',
    paid: false,
    dateSpecified: true,
    liquidityChanges: [],
    ...over,
  };
}

function month(events: MonthObligation[]): MonthBreakdown {
  return {
    year: 2026, month: 10, label: 'Nov 2026', days: 30,
    events, daily: [], totalIn: 0, totalOut: 0, net: 0, liquidity: [],
  };
}

describe('upcomingEvents', () => {
  it('keeps only what falls inside the window, sorted by date', () => {
    const got = upcomingEvents([month([
      event({ date: '2026-11-20', name: 'Soon' }),
      event({ date: '2026-11-10', name: 'Already past' }),
      event({ date: '2026-12-30', name: 'Beyond the window' }),
      event({ date: '2026-11-15', name: 'Today' }),
    ])], 30, NOW);
    expect(got.map((e) => e.name)).toEqual(['Today', 'Soon']);
    expect(got.map((e) => e.daysAway)).toEqual([0, 5]);
  });

  it('spans a month boundary', () => {
    const got = upcomingEvents([
      month([event({ date: '2026-11-28', name: 'This month' })]),
      month([event({ date: '2026-12-05', name: 'Next month' })]),
    ], 30, NOW);
    expect(got.map((e) => e.name)).toEqual(['This month', 'Next month']);
  });

  it('drops items already paid or received', () => {
    const got = upcomingEvents([month([
      event({ date: '2026-11-20', name: 'Paid', paid: true }),
      event({ date: '2026-11-20', name: 'Unpaid' }),
    ])], 30, NOW);
    expect(got.map((e) => e.name)).toEqual(['Unpaid']);
  });

  it('puts money in before money out on the same day', () => {
    const got = upcomingEvents([month([
      event({ date: '2026-11-20', name: 'Bill', direction: 'out', amount: 50 }),
      event({ date: '2026-11-20', name: 'Paycheck', direction: 'in', amount: 3000 }),
    ])], 30, NOW);
    expect(got.map((e) => e.name)).toEqual(['Paycheck', 'Bill']);
  });
});

describe('totalsFor', () => {
  it('sums in, out and net', () => {
    const events = upcomingEvents([month([
      event({ date: '2026-11-20', direction: 'in', amount: 3000, name: 'Pay' }),
      event({ date: '2026-11-21', direction: 'out', amount: 1200, name: 'Rent' }),
      event({ date: '2026-11-22', direction: 'out', amount: 300, name: 'Card' }),
    ])], 30, NOW);
    expect(totalsFor(events)).toEqual({ in: 3000, out: 1500, net: 1500 });
  });
});

describe('whenLabel', () => {
  const at = (date: string) => upcomingEvents([month([event({ date })])], 60, NOW)[0];

  it('uses relative wording for the next few days', () => {
    expect(whenLabel(at('2026-11-15'), NOW)).toBe('Today');
    expect(whenLabel(at('2026-11-16'), NOW)).toBe('Tomorrow');
    expect(whenLabel(at('2026-11-19'), NOW)).toBe('In 4 days');
  });

  it('falls back to a date further out', () => {
    expect(whenLabel(at('2026-11-30'), NOW)).toBe('Nov 30');
  });

  it('includes the year when it differs', () => {
    expect(whenLabel(at('2027-01-05'), NOW)).toBe('Jan 5, 2027');
  });
});
