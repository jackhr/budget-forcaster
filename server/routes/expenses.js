const express = require('express');
const router = express.Router();
const db = require('../db/database');
const { reorder, ORDER_BY } = require('../lib/data');
const { normalizeDate, dateError } = require('../lib/dates');
const { cleanAllocations, cleanFundingRules, parseJsonArray } = require('../lib/funding');

const VALID_FREQUENCIES = ['weekly', 'biweekly', 'semimonthly', 'monthly', 'quarterly', 'annually', 'one-time'];

function normalizeFrequency(freq, fallback = 'monthly') {
  return VALID_FREQUENCIES.includes(freq) ? freq : fallback;
}

function isAmount(v) {
  return typeof v === 'number' && isFinite(v);
}

// A one-time expense has a single occurrence, so an end date is meaningless.
function endDateFor(frequency, endDate) {
  return frequency === 'one-time' ? null : normalizeDate(endDate, 'end_date');
}

// An end date before the first occurrence would silently produce an expense that never bills.
function rangeError(res, startDate, endDate) {
  if (startDate && endDate && endDate < startDate) {
    res.status(400).json({ error: 'end_date must be on or after start_date' });
    return true;
  }
  return false;
}

function serialize(row) {
  return {
    ...row,
    funding_allocations: parseJsonArray(row.funding_allocations),
    funding_rules: parseJsonArray(row.funding_rules),
  };
}

router.get('/', (req, res) => {
  const rows = db.prepare(`SELECT * FROM expenses WHERE user_id = ? ${ORDER_BY}`).all(req.user.id);
  res.json(rows.map(serialize));
});

router.post('/reorder', (req, res) => {
  reorder(db, 'expenses', req.body.ids, req.user.id);
  res.json({ ok: true });
});

router.post('/', (req, res) => {
  const { name, monthly_amount, group_id, funding_allocations, funding_rules, frequency, start_date, end_date } = req.body;
  if (!name || !isAmount(monthly_amount) || monthly_amount < 0 || !start_date) {
    return res.status(400).json({ error: 'name, a non-negative numeric monthly_amount and start_date are required' });
  }
  const normalizedFrequency = normalizeFrequency(frequency);
  let normalizedStart;
  let normalizedEnd;
  let cleanedRules;
  try {
    normalizedStart = normalizeDate(start_date, 'start_date', { required: true });
    normalizedEnd = endDateFor(normalizedFrequency, end_date);
    cleanedRules = cleanFundingRules(funding_rules);
  } catch (e) {
    if (dateError(res, e)) return;
    throw e;
  }
  if (rangeError(res, normalizedStart, normalizedEnd)) return;
  const stmt = db.prepare(
    'INSERT INTO expenses (user_id, name, monthly_amount, group_id, funding_allocations, funding_rules, frequency, start_date, end_date) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
  );
  const result = stmt.run(
    req.user.id, name, monthly_amount, group_id ?? null,
    JSON.stringify(cleanAllocations(funding_allocations)),
    JSON.stringify(cleanedRules),
    normalizedFrequency, normalizedStart, normalizedEnd,
  );
  const row = db.prepare('SELECT * FROM expenses WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(serialize(row));
});

router.put('/:id', (req, res) => {
  const { name, monthly_amount, group_id, funding_allocations, funding_rules, frequency, start_date, end_date } = req.body;
  const { id } = req.params;
  const existing = db.prepare('SELECT * FROM expenses WHERE id = ? AND user_id = ?').get(id, req.user.id);
  if (!existing) return res.status(404).json({ error: 'Not found' });
  const normalizedFrequency = frequency ? normalizeFrequency(frequency, existing.frequency) : existing.frequency;
  let cleanedRules = existing.funding_rules;
  let normalizedStart = existing.start_date;
  let normalizedEnd = existing.end_date;
  try {
    if (start_date !== undefined) normalizedStart = normalizeDate(start_date, 'start_date', { required: true });
    if (end_date !== undefined) normalizedEnd = normalizeDate(end_date, 'end_date');
    if (funding_rules !== undefined) cleanedRules = JSON.stringify(cleanFundingRules(funding_rules));
  } catch (e) {
    if (dateError(res, e)) return;
    throw e;
  }
  // A one-time expense has a single occurrence, so an end date is meaningless.
  if (normalizedFrequency === 'one-time') normalizedEnd = null;
  if (rangeError(res, normalizedStart, normalizedEnd)) return;

  db.prepare(
    `UPDATE expenses
     SET name = ?, monthly_amount = ?, group_id = ?, funding_allocations = ?, funding_rules = ?, frequency = ?, start_date = ?, end_date = ?, updated_at = datetime('now')
     WHERE id = ? AND user_id = ?`
  ).run(
    name ?? existing.name,
    monthly_amount ?? existing.monthly_amount,
    group_id !== undefined ? (group_id ?? null) : existing.group_id,
    funding_allocations !== undefined ? JSON.stringify(cleanAllocations(funding_allocations)) : existing.funding_allocations,
    cleanedRules,
    normalizedFrequency,
    normalizedStart,
    normalizedEnd,
    id, req.user.id,
  );
  const row = db.prepare('SELECT * FROM expenses WHERE id = ?').get(id);
  res.json(serialize(row));
});

router.delete('/:id', (req, res) => {
  const { id } = req.params;
  const existing = db.prepare('SELECT * FROM expenses WHERE id = ? AND user_id = ?').get(id, req.user.id);
  if (!existing) return res.status(404).json({ error: 'Not found' });
  db.prepare("DELETE FROM paid_status WHERE entity_type = 'expense' AND entity_id = ? AND user_id = ?").run(id, req.user.id);
  db.prepare('DELETE FROM expenses WHERE id = ? AND user_id = ?').run(id, req.user.id);
  res.status(204).end();
});

module.exports = router;
