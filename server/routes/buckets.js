const express = require('express');
const router = express.Router();
const db = require('../db/database');
const { reorder, ORDER_BY } = require('../lib/data');
const { normalizeDate, dateError } = require('../lib/dates');

const FREQUENCIES = ['weekly', 'biweekly', 'semimonthly', 'monthly', 'quarterly', 'annually', 'one-time'];

function isAmount(v) {
  return typeof v === 'number' && isFinite(v);
}

/**
 * Validate and normalize a bucket body. Returns { error } or { value }.
 *
 * A bucket is money earmarked inside one account: what's set aside today, plus
 * a contribution schedule that stops at an optional target.
 */
function parseBucket(body, userId) {
  const name = String(body?.name ?? '').trim();
  if (!name) return { error: 'name is required' };
  if (name.length > 120) return { error: 'name is too long' };

  const balance = body?.balance ?? 0;
  if (!isAmount(balance) || balance < 0) return { error: 'balance must be zero or more' };

  const contribution = body?.contribution ?? 0;
  if (!isAmount(contribution) || contribution < 0) return { error: 'contribution must be zero or more' };

  let targetAmount = null;
  if (body?.target_amount != null) {
    if (!isAmount(body.target_amount) || body.target_amount <= 0) {
      return { error: 'target_amount must be greater than zero' };
    }
    targetAmount = body.target_amount;
  }

  const frequency = FREQUENCIES.includes(body?.frequency) ? body.frequency : 'monthly';

  let startDate = null;
  let endDate = null;
  for (const [field, raw] of [['start_date', body?.start_date], ['end_date', body?.end_date]]) {
    if (!raw) continue;
    const problem = dateError(raw);
    if (problem) return { error: `${field} ${problem}` };
    if (field === 'start_date') startDate = normalizeDate(raw);
    else endDate = normalizeDate(raw);
  }
  if (frequency === 'one-time') endDate = null;
  if (startDate && endDate && endDate < startDate) return { error: 'end_date must be on or after start_date' };

  // An account that isn't this user's reads as missing, never as an attachment.
  let accountId = null;
  if (body?.account_id != null) {
    const owned = db.prepare('SELECT 1 FROM accounts WHERE id = ? AND user_id = ?').get(body.account_id, userId);
    if (!owned) return { error: 'account_id does not exist' };
    accountId = body.account_id;
  }

  const note = body?.note == null ? null : String(body.note).trim().slice(0, 500) || null;

  return { value: { name, accountId, balance, targetAmount, contribution, frequency, startDate, endDate, note } };
}

router.get('/', (req, res) => {
  res.json(db.prepare(`SELECT * FROM buckets WHERE user_id = ? ${ORDER_BY}`).all(req.user.id));
});

router.post('/reorder', (req, res) => {
  reorder(db, 'buckets', req.body.ids, req.user.id);
  res.json({ ok: true });
});

router.post('/', (req, res) => {
  const { error, value } = parseBucket(req.body, req.user.id);
  if (error) return res.status(400).json({ error });

  const result = db.prepare(
    `INSERT INTO buckets (user_id, name, account_id, balance, target_amount, contribution, frequency, start_date, end_date, note)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(req.user.id, value.name, value.accountId, value.balance, value.targetAmount, value.contribution,
    value.frequency, value.startDate, value.endDate, value.note);

  res.status(201).json(db.prepare('SELECT * FROM buckets WHERE id = ?').get(result.lastInsertRowid));
});

router.put('/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM buckets WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!existing) return res.status(404).json({ error: 'Not found' });

  const { error, value } = parseBucket({ ...existing, ...req.body }, req.user.id);
  if (error) return res.status(400).json({ error });

  db.prepare(
    `UPDATE buckets SET name = ?, account_id = ?, balance = ?, target_amount = ?, contribution = ?, frequency = ?,
     start_date = ?, end_date = ?, note = ?, updated_at = datetime('now') WHERE id = ? AND user_id = ?`
  ).run(value.name, value.accountId, value.balance, value.targetAmount, value.contribution, value.frequency,
    value.startDate, value.endDate, value.note, req.params.id, req.user.id);

  res.json(db.prepare('SELECT * FROM buckets WHERE id = ?').get(req.params.id));
});

router.delete('/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM buckets WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!existing) return res.status(404).json({ error: 'Not found' });
  db.prepare('DELETE FROM buckets WHERE id = ? AND user_id = ?').run(req.params.id, req.user.id);
  res.status(204).end();
});

module.exports = router;
