const express = require('express');
const router = express.Router();
const db = require('../db/database');
const { detectDebtPayment } = require('../lib/paidDetection');

// "Paid this month" for debts and expenses. Precedence for a debt: a saved
// manual override, then a payment detected from Plaid, then (client-side) the
// autopay-day default. Expenses have manual overrides only.

const TYPES = { debt: 'debts', expense: 'expenses' };

function monthKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

// Plaid amounts: negative = money in, i.e. a payment received on a card or loan.
const findPaymentTxn = db.prepare(
  `SELECT date, amount FROM plaid_transactions
   WHERE user_id = ? AND account_id = ? AND date LIKE ? AND amount < 0 AND category = 'LOAN_PAYMENTS'
   ORDER BY date LIMIT 1`
);

function statusPayload(userId, month = monthKey()) {
  const manual = db.prepare('SELECT entity_type, entity_id, paid FROM paid_status WHERE user_id = ? AND month = ?')
    .all(userId, month);
  const manualOf = (type, id) => manual.find((row) => row.entity_type === type && row.entity_id === id);

  const debts = [];
  for (const debt of db.prepare('SELECT * FROM debts WHERE user_id = ?').all(userId)) {
    const override = manualOf('debt', debt.id);
    if (override) {
      debts.push({ id: debt.id, paid: !!override.paid, source: 'manual', detail: null });
      continue;
    }
    if (!debt.plaid_account_id) continue;
    const detail = detectDebtPayment(debt, month, (m) => findPaymentTxn.get(userId, debt.plaid_account_id, `${m}-%`) ?? null);
    if (detail) debts.push({ id: debt.id, paid: true, source: 'detected', detail });
  }
  const expenses = manual
    .filter((row) => row.entity_type === 'expense')
    .map((row) => ({ id: row.entity_id, paid: !!row.paid, source: 'manual', detail: null }));
  return { month, debts, expenses };
}

function validTarget(req, res) {
  const table = TYPES[req.params.type];
  if (!table) {
    res.status(400).json({ error: 'type must be debt or expense' });
    return null;
  }
  if (!db.prepare(`SELECT 1 FROM ${table} WHERE id = ? AND user_id = ?`).get(req.params.id, req.user.id)) {
    res.status(404).json({ error: 'Not found' });
    return null;
  }
  return true;
}

router.get('/', (req, res) => {
  res.json(statusPayload(req.user.id));
});

// Set this month's manual override.
router.put('/:type/:id', (req, res) => {
  if (!validTarget(req, res)) return;
  if (typeof req.body.paid !== 'boolean') return res.status(400).json({ error: 'paid must be a boolean' });
  db.prepare(
    `INSERT INTO paid_status (user_id, entity_type, entity_id, month, paid) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(user_id, entity_type, entity_id, month) DO UPDATE SET paid = excluded.paid, updated_at = datetime('now')`
  ).run(req.user.id, req.params.type, Number(req.params.id), monthKey(), req.body.paid ? 1 : 0);
  res.json(statusPayload(req.user.id));
});

// Clear this month's override, returning to detection/default.
router.delete('/:type/:id', (req, res) => {
  if (!validTarget(req, res)) return;
  db.prepare('DELETE FROM paid_status WHERE user_id = ? AND entity_type = ? AND entity_id = ? AND month = ?')
    .run(req.user.id, req.params.type, Number(req.params.id), monthKey());
  res.json(statusPayload(req.user.id));
});

module.exports = { router };
