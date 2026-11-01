import { describe, expect, it } from 'vitest';
import { GOAL_KINDS, goalBoard, goalProgress, monthsUntil, type GoalInputs } from './goals';
import type { Goal } from '../types';

const NOW = new Date(2026, 10, 1); // Nov 2026

const goal = (over: Partial<Goal> = {}): Goal => ({
  id: 1, name: 'Goal', kind: 'savings', target_amount: 10000, start_amount: null,
  target_date: null, account_id: null, debt_id: null, note: null, sort_order: 0,
  created_at: '', updated_at: '', ...over,
});

// Cash climbs 2k a month; the card clears at month 4; net worth crosses 0 at 6.
const inputs: GoalInputs = {
  accountSeries: {
    labels: ['Nov', 'Dec', 'Jan', 'Feb', 'Mar', 'Apr'],
    total: [6000, 8000, 10000, 12000, 14000, 16000],
    series: [{ id: 2, name: 'Savings', values: [1000, 2000, 3000, 4000, 5000, 6000] }],
  },
  netWorth: [-5000, -4000, -3000, -2000, -1000, 500].map((netWorth, i) => ({
    month: i, label: `M${i}`, cash: 0, debt: 0, netWorth,
  })),
  remainingByDebt: new Map([[7, [3000, 2000, 1000, 500, 0, 0]]]),
  debtRemaining: [9000, 7000, 5000, 3000, 1000, 0],
  accounts: [{ id: 2, balance: 1000 }],
  debts: [{ id: 7, balance: 4000 }],
  totalCash: 4000,
};

describe('savings goals', () => {
  it('measures total cash against the target', () => {
    const p = goalProgress(goal({ target_amount: 10000 }), inputs, NOW);
    expect(p.current).toBe(4000);
    expect(p.target).toBe(10000);
    expect(p.fraction).toBeCloseTo(0.4, 5);
  });

  it('projects the month the plan reaches it', () => {
    const p = goalProgress(goal({ target_amount: 10000 }), inputs, NOW);
    expect(p.monthIndex).toBe(2);
    expect(p.projectedLabel).toBe('Jan 2027');
    expect(p.status).toBe('on-track');
  });

  it('tracks one account when told to, not the total', () => {
    const p = goalProgress(goal({ target_amount: 5000, account_id: 2 }), inputs, NOW);
    expect(p.current).toBe(1000);
    expect(p.monthIndex).toBe(4); // the account's own series, not the total
  });

  it('says met when it is already there', () => {
    const p = goalProgress(goal({ target_amount: 1000 }), inputs, NOW);
    expect(p.status).toBe('met');
    expect(p.fraction).toBe(1);
  });

  it('is off-track when the forecast never reaches it', () => {
    const p = goalProgress(goal({ target_amount: 999999 }), inputs, NOW);
    expect(p.status).toBe('off-track');
    expect(p.monthIndex).toBeNull();
  });
});

describe('deadlines', () => {
  it('is ahead when the projection lands before the date', () => {
    const p = goalProgress(goal({ target_amount: 10000, target_date: '2027-06-30' }), inputs, NOW);
    expect(p.status).toBe('ahead');
    expect(p.slackMonths).toBe(5); // reaches month 2, deadline at month 7
  });

  it('is behind when it lands after', () => {
    const p = goalProgress(goal({ target_amount: 10000, target_date: '2026-12-31' }), inputs, NOW);
    expect(p.status).toBe('behind');
    expect(p.slackMonths).toBe(-1);
  });

  it('counts whole months to the deadline', () => {
    expect(monthsUntil('2026-11-30', NOW)).toBe(0);
    expect(monthsUntil('2027-11-01', NOW)).toBe(12);
    expect(monthsUntil('2026-08-01', NOW)).toBe(-3);
  });
});

describe('payoff goals', () => {
  const payoff = (over: Partial<Goal> = {}) =>
    goal({ kind: 'debt_payoff', target_amount: null, debt_id: 7, start_amount: 5000, ...over });

  it('counts down from the balance recorded when the goal was set', () => {
    const p = goalProgress(payoff(), inputs, NOW);
    expect(p.current).toBe(4000);
    expect(p.target).toBe(0);
    expect(p.fraction).toBeCloseTo(0.2, 5); // 1000 of 5000 cleared
  });

  it('reports no progress rather than inventing a baseline', () => {
    // Goals created before start_amount existed have none recorded.
    const p = goalProgress(payoff({ start_amount: null }), inputs, NOW);
    expect(p.fraction).toBe(0);
    expect(p.status).toBe('on-track');
  });

  it('projects the month the debt clears', () => {
    const p = goalProgress(payoff(), inputs, NOW);
    expect(p.monthIndex).toBe(4);
    expect(p.projectedLabel).toBe('Mar 2027');
  });

  it('tracks everything owed when no debt is named', () => {
    const p = goalProgress(payoff({ debt_id: null, start_amount: 12000 }), inputs, NOW);
    expect(p.current).toBe(4000);
    expect(p.monthIndex).toBe(5);
  });

  it('is met once the balance is clear', () => {
    const cleared = { ...inputs, debts: [{ id: 7, balance: 0 }] };
    expect(goalProgress(payoff(), cleared, NOW).status).toBe('met');
  });
});

describe('net worth goals', () => {
  it('reads the first projected month as today', () => {
    const p = goalProgress(goal({ kind: 'net_worth', target_amount: 0 }), inputs, NOW);
    expect(p.current).toBe(-5000);
  });

  it('finds the month it crosses the target', () => {
    const p = goalProgress(goal({ kind: 'net_worth', target_amount: 0 }), inputs, NOW);
    expect(p.monthIndex).toBe(5);
    expect(p.status).toBe('on-track');
  });
});

describe('a goal whose target was deleted', () => {
  it('says so rather than tracking the wrong thing', () => {
    const missingAccount = goalProgress(goal({ target_amount: 100, account_id: 999 }), inputs, NOW);
    expect(missingAccount.status).toBe('untracked');

    const missingDebt = goalProgress(
      goal({ kind: 'debt_payoff', target_amount: null, debt_id: 999 }), inputs, NOW,
    );
    expect(missingDebt.status).toBe('untracked');
  });
});

describe('goalBoard', () => {
  it('puts what is at risk first and finished goals last', () => {
    const board = goalBoard([
      goal({ id: 1, name: 'Done', target_amount: 1000 }),
      goal({ id: 2, name: 'Fine', target_amount: 10000 }),
      goal({ id: 3, name: 'Late', target_amount: 10000, target_date: '2026-12-01' }),
      goal({ id: 4, name: 'Never', target_amount: 999999 }),
    ], inputs, NOW);
    expect(board.map((p) => p.goal.name)).toEqual(['Late', 'Never', 'Fine', 'Done']);
  });

  it('orders equal-risk goals by how soon they are due', () => {
    const board = goalBoard([
      goal({ id: 1, name: 'Undated', target_amount: 10000 }),
      goal({ id: 2, name: 'Later', target_amount: 10000, target_date: '2028-01-01' }),
      goal({ id: 3, name: 'Sooner', target_amount: 10000, target_date: '2027-03-01' }),
    ], inputs, NOW);
    expect(board.map((p) => p.goal.name)).toEqual(['Sooner', 'Later', 'Undated']);
  });

  it('handles having no goals', () => {
    expect(goalBoard([], inputs, NOW)).toEqual([]);
  });
});

describe('kinds', () => {
  it('describes each one it offers', () => {
    expect(GOAL_KINDS.map((k) => k.id)).toEqual(['savings', 'debt_payoff', 'net_worth']);
    for (const kind of GOAL_KINDS) {
      expect(kind.label.trim()).not.toBe('');
      expect(kind.description.trim()).not.toBe('');
    }
  });
});
