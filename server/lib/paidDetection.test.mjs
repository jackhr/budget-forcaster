import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { detectDebtPayment } = require('./paidDetection');

const card = (over) => ({ last_payment_date: null, last_payment_amount: null, next_payment_due_date: null, ...over });

describe('detectDebtPayment', () => {
  it('detects a payment made this month', () => {
    expect(detectDebtPayment(card({ last_payment_date: '2026-09-07', last_payment_amount: 73.64 }), '2026-09'))
      .toBe('Plaid: paid $73.64 on 2026-09-07');
  });

  it('detects an early payment that covered this month’s due date', () => {
    const early = card({ last_payment_date: '2026-08-28', last_payment_amount: 600, next_payment_due_date: '2026-10-02' });
    expect(detectDebtPayment(early, '2026-09')).toContain('for the 2026-09-02 due date');
  });

  it('does not count last month’s payment when this month’s due date is still ahead', () => {
    const upcoming = card({ last_payment_date: '2026-08-17', next_payment_due_date: '2026-09-17' });
    expect(detectDebtPayment(upcoming, '2026-09')).toBeNull();
  });

  it('does not count a payment that belongs to the previous due date', () => {
    const missed = card({ last_payment_date: '2026-08-01', next_payment_due_date: '2026-10-10' });
    expect(detectDebtPayment(missed, '2026-09')).toBeNull();
  });

  it('falls back to a payment transaction posted this month', () => {
    const txn = (month) => (month === '2026-09' ? { date: '2026-09-03', amount: -250 } : null);
    expect(detectDebtPayment(card({}), '2026-09', txn)).toBe('Plaid: payment of $250 posted 2026-09-03');
  });
});
