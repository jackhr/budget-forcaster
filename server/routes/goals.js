const express = require('express');
const router = express.Router();
const db = require('../db/database');
const { reorder, ORDER_BY } = require('../lib/data');
const { normalizeDate, dateError } = require('../lib/dates');

const KINDS = ['savings', 'debt_payoff', 'net_worth'];

function isAmount(v) {
  return typeof v === 'number' && isFinite(v);
}

/**
 * Validate and normalize a goal body. Returns { error } or { value }.
 *
 * A savings or net-worth goal is an amount to reach, so it needs one. A payoff
 * goal's target is always zero, so an amount would be meaningless.
 */
function parseGoal(body, userId) {
  const name = String(body?.name ?? '').trim();
  if (!name) return { error: 'name is required' };
  if (name.length > 120) return { error: 'name is too long' };

  const kind = String(body?.kind ?? '');
  if (!KINDS.includes(kind)) return { error: `kind must be one of: ${KINDS.join(', ')}` };

  const needsAmount = kind !== 'debt_payoff';
  let targetAmount = null;
  if (needsAmount) {
    if (!isAmount(body?.target_amount) || body.target_amount <= 0) {
      return { error: 'target_amount must be greater than zero' };
    }
    targetAmount = body.target_amount;
  }

  let targetDate = null;
  if (body?.target_date) {
    const problem = dateError(body.target_date);
    if (problem) return { error: `target_date ${problem}` };
    targetDate = normalizeDate(body.target_date);
  }

  // A target that doesn't belong to this user must read as "not found", not as
  // a silent attachment to someone else's row.
  let accountId = null;
  if (kind === 'savings' && body?.account_id != null) {
    const owned = db.prepare('SELECT 1 FROM accounts WHERE id = ? AND user_id = ?').get(body.account_id, userId);
    if (!owned) return { error: 'account_id does not exist' };
    accountId = body.account_id;
  }

  // A savings goal tracks a bucket instead of a raw balance when one is given.
  let bucketId = null;
  if (kind === 'savings' && body?.bucket_id != null) {
    const owned = db.prepare('SELECT 1 FROM buckets WHERE id = ? AND user_id = ?').get(body.bucket_id, userId);
    if (!owned) return { error: 'bucket_id does not exist' };
    bucketId = body.bucket_id;
    accountId = null;
  }

  let debtId = null;
  if (kind === 'debt_payoff' && body?.debt_id != null) {
    const owned = db.prepare('SELECT 1 FROM debts WHERE id = ? AND user_id = ?').get(body.debt_id, userId);
    if (!owned) return { error: 'debt_id does not exist' };
    debtId = body.debt_id;
  }

  const note = body?.note == null ? null : String(body.note).trim().slice(0, 500) || null;

  return { value: { name, kind, targetAmount, targetDate, accountId, bucketId, debtId, note } };
}

/**
 * Where the goal starts from, so progress has a baseline.
 *
 * Only a payoff goal needs it: "reach $25k" is measured from zero, but
 * "clear this card" is measured from whatever was owed when the goal was set.
 * Captured once, at creation — re-reading it later would make progress vanish
 * every time the balance moved.
 */
function startAmountFor(value, userId) {
  if (value.kind !== 'debt_payoff') return null;
  const row = value.debtId != null
    ? db.prepare('SELECT balance AS total FROM debts WHERE id = ? AND user_id = ?').get(value.debtId, userId)
    : db.prepare('SELECT COALESCE(SUM(balance), 0) AS total FROM debts WHERE user_id = ?').get(userId);
  return row?.total ?? null;
}

router.get('/', (req, res) => {
  res.json(db.prepare(`SELECT * FROM goals WHERE user_id = ? ${ORDER_BY}`).all(req.user.id));
});

router.post('/reorder', (req, res) => {
  reorder(db, 'goals', req.body.ids, req.user.id);
  res.json({ ok: true });
});

router.post('/', (req, res) => {
  const { error, value } = parseGoal(req.body, req.user.id);
  if (error) return res.status(400).json({ error });

  const result = db.prepare(
    `INSERT INTO goals (user_id, name, kind, target_amount, start_amount, target_date, account_id, bucket_id, debt_id, note)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(req.user.id, value.name, value.kind, value.targetAmount, startAmountFor(value, req.user.id),
    value.targetDate, value.accountId, value.bucketId, value.debtId, value.note);

  res.status(201).json(db.prepare('SELECT * FROM goals WHERE id = ?').get(result.lastInsertRowid));
});

router.put('/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM goals WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!existing) return res.status(404).json({ error: 'Not found' });

  const { error, value } = parseGoal({ ...existing, ...req.body }, req.user.id);
  if (error) return res.status(400).json({ error });

  // Re-baseline only when the goal starts tracking something else; otherwise
  // an edit would silently reset the progress already made.
  const retarget = value.kind !== existing.kind || value.debtId !== existing.debt_id;
  const startAmount = retarget ? startAmountFor(value, req.user.id) : existing.start_amount;

  db.prepare(
    `UPDATE goals SET name = ?, kind = ?, target_amount = ?, start_amount = ?, target_date = ?,
     account_id = ?, bucket_id = ?, debt_id = ?, note = ?, updated_at = datetime('now') WHERE id = ? AND user_id = ?`
  ).run(value.name, value.kind, value.targetAmount, startAmount, value.targetDate, value.accountId,
    value.bucketId, value.debtId, value.note, req.params.id, req.user.id);

  res.json(db.prepare('SELECT * FROM goals WHERE id = ?').get(req.params.id));
});

router.delete('/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM goals WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!existing) return res.status(404).json({ error: 'Not found' });
  db.prepare('DELETE FROM goals WHERE id = ? AND user_id = ?').run(req.params.id, req.user.id);
  res.status(204).end();
});

module.exports = router;
