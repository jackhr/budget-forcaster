import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const Database = require('better-sqlite3');
const { cleanCategories, monthBounds, spentIn, categorySummary } = require('./budgets');

function dbWith(rows) {
  const db = new Database(':memory:');
  db.exec(`CREATE TABLE plaid_transactions (
    transaction_id TEXT PRIMARY KEY, user_id INTEGER, date TEXT, amount REAL,
    pending INTEGER NOT NULL DEFAULT 0, category TEXT, category_detailed TEXT
  )`);
  const insert = db.prepare('INSERT INTO plaid_transactions VALUES (?, ?, ?, ?, ?, ?, ?)');
  rows.forEach((r, i) => insert.run(`t${i}`, r.user ?? 1, r.date, r.amount, r.pending ? 1 : 0, r.category, r.detailed ?? null));
  return db;
}

const NOW = new Date(2026, 10, 15); // 15 Nov 2026

describe('cleanCategories', () => {
  it('keeps real spending categories once, and drops transfers, income and junk', () => {
    expect(cleanCategories(['food_and_drink', 'FOOD_AND_DRINK', 'TRANSFER_OUT', 'INCOME', 'no spaces', 42, null]))
      .toEqual(['FOOD_AND_DRINK']);
    expect(cleanCategories('FOOD_AND_DRINK')).toEqual([]);
  });
});

describe('monthBounds', () => {
  it('covers a whole calendar month, end exclusive', () => {
    expect(monthBounds(NOW)).toEqual(['2026-11-01', '2026-12-01']);
    expect(monthBounds(NOW, -3)).toEqual(['2026-08-01', '2026-09-01']);
  });
});

describe('spentIn', () => {
  const db = dbWith([
    { date: '2026-11-02', amount: 80, category: 'FOOD_AND_DRINK' },
    { date: '2026-11-09', amount: -15, category: 'FOOD_AND_DRINK' },               // a refund nets off
    { date: '2026-11-10', amount: 40, category: 'FOOD_AND_DRINK', pending: true }, // not posted yet
    { date: '2026-11-11', amount: 25, category: 'GENERAL_MERCHANDISE', detailed: 'GENERAL_MERCHANDISE_SUPERSTORES' },
    { date: '2026-10-31', amount: 500, category: 'FOOD_AND_DRINK' },               // last month
    { date: '2026-11-03', amount: 999, category: 'FOOD_AND_DRINK', user: 2 },      // someone else
  ]);

  it("sums one user's posted spending in the month", () => {
    expect(spentIn(db, 1, ['FOOD_AND_DRINK'], monthBounds(NOW))).toBe(65);
  });

  it('matches a detailed category as well as a primary one', () => {
    expect(spentIn(db, 1, ['GENERAL_MERCHANDISE_SUPERSTORES'], monthBounds(NOW))).toBe(25);
  });

  it('is zero with no categories rather than everything', () => {
    expect(spentIn(db, 1, [], monthBounds(NOW))).toBe(0);
  });
});

describe('categorySummary', () => {
  it('lists spending categories with a three-month average, biggest first', () => {
    const db = dbWith([
      { date: '2026-08-05', amount: 300, category: 'FOOD_AND_DRINK' },
      { date: '2026-09-05', amount: 300, category: 'FOOD_AND_DRINK' },
      { date: '2026-10-05', amount: 300, category: 'FOOD_AND_DRINK' },
      { date: '2026-11-05', amount: 120, category: 'FOOD_AND_DRINK' },
      { date: '2026-10-05', amount: 30, category: 'ENTERTAINMENT' },
      { date: '2026-10-06', amount: 2000, category: 'TRANSFER_OUT' },
    ]);
    expect(categorySummary(db, 1, NOW)).toEqual([
      { category: 'FOOD_AND_DRINK', this_month: 120, monthly_average: 300 },
      { category: 'ENTERTAINMENT', this_month: 0, monthly_average: 10 },
    ]);
  });
});
