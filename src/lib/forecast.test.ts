import { describe, it, expect } from 'vitest';
import { buildForecast, buildSavings, buildNetWorth, monthOffset } from './forecast';
import type { Expense, IncomeSource, ScheduledPayment } from '../types';

const NOW = new Date(2026, 0, 1); // Jan 2026, deterministic

function income(over: Partial<IncomeSource>): IncomeSource {
  return { id: 1, name: 'I', monthly_amount: 0, frequency: 'monthly', group_id: null, created_at: '', updated_at: '', ...over };
}
function expense(over: Partial<Expense>): Expense {
  return { id: 1, name: 'E', monthly_amount: 0, group_id: null, created_at: '', updated_at: '', ...over };
}

describe('buildForecast', () => {
  it('computes net as income minus expenses', () => {
    const inc = [income({ monthly_amount: 5000 })];
    const exp = [expense({ monthly_amount: 2000 })];
    const fc = buildForecast(inc, exp, [], [], 3, 0, NOW);
    expect(fc[0].income).toBe(5000);
    expect(fc[0].expenses).toBe(2000);
    expect(fc[0].net).toBe(3000);
  });

  it('applies inflation to ongoing expenses over time', () => {
    const exp = [expense({ monthly_amount: 1000 })];
    const fc = buildForecast([], exp, [], [], 13, 12, NOW); // 12% annual
    expect(fc[0].expenses).toBeCloseTo(1000, 5);
    expect(fc[12].expenses).toBeCloseTo(1120, 0); // +12% after a year
  });

  it('includes debt outflow in expenses', () => {
    const fc = buildForecast([], [], [], [300, 300, 0], 3, 0, NOW);
    expect(fc[0].expenses).toBe(300);
    expect(fc[2].expenses).toBe(0);
  });
});

describe('buildSavings', () => {
  it('accumulates net into a running balance from the starting cash', () => {
    const inc = [income({ monthly_amount: 1000 })];
    const exp = [expense({ monthly_amount: 400 })];
    const sv = buildSavings(inc, exp, [], [], 3, 5000, 0, NOW);
    expect(sv[0].balance).toBe(5600);
    expect(sv[1].balance).toBe(6200);
    expect(sv[2].balance).toBe(6800);
  });

  it('subtracts a one-off future expense in the right month', () => {
    const pay: ScheduledPayment = { id: 1, name: 'Trip', amount: 1000, frequency: 'one-time', start_date: '2026-03-01', end_date: null, created_at: '', updated_at: '' };
    const sv = buildSavings([], [], [pay], [], 4, 1000, 0, NOW);
    expect(monthOffset('2026-03-01', NOW)).toBe(2);
    expect(sv[2].scheduledOut).toBe(1000);
    expect(sv[2].balance).toBe(0);
  });
});

describe('buildNetWorth', () => {
  it('is cash minus remaining debt', () => {
    const sv = buildSavings([income({ monthly_amount: 1000 })], [], [], [200, 200], 2, 0, 0, NOW);
    const nw = buildNetWorth(sv, [800, 600]);
    expect(nw[0].cash).toBe(sv[0].balance);
    expect(nw[0].debt).toBe(800);
    expect(nw[0].netWorth).toBe(sv[0].balance - 800);
  });
});
