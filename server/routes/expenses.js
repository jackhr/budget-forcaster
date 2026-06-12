const express = require('express');
const router = express.Router();
const db = require('../db/database');
const { reorder, ORDER_BY } = require('../lib/data');
const { normalizeDate, dateError } = require('../lib/dates');
const { cleanAllocations, cleanFundingRules, parseJsonArray } = require('../lib/funding');

const VALID_FREQUENCIES = ['weekly', 'biweekly', 'monthly', 'quarterly', 'annually', 'one-time'];

function normalizeFrequency(freq, fallback = 'monthly') {
  return VALID_FREQUENCIES.includes(freq) ? freq : fallback;
}

function isAmount(v) {
  return typeof v === 'number' && isFinite(v);
}

function serialize(row) {
  return {
    ...row,
    funding_allocations: parseJsonArray(row.funding_allocations),
    funding_rules: parseJsonArray(row.funding_rules),
  };
}

router.get('/', (req, res) => {
  const rows = db.prepare(`SELECT * FROM expenses ${ORDER_BY}`).all();
  res.json(rows.map(serialize));
});

router.post('/reorder', (req, res) => {
  reorder(db, 'expenses', req.body.ids);
  res.json({ ok: true });
});

router.post('/', (req, res) => {
  const { name, monthly_amount, group_id, funding_allocations, funding_rules, frequency, start_date } = req.body;
  if (!name || !isAmount(monthly_amount) || monthly_amount < 0 || !start_date) {
    return res.status(400).json({ error: 'name, a non-negative numeric monthly_amount and start_date are required' });
  }
  let normalizedStart;
  let cleanedRules;
  try {
    normalizedStart = normalizeDate(start_date, 'start_date', { required: true });
    cleanedRules = cleanFundingRules(funding_rules);
  } catch (e) {
    if (dateError(res, e)) return;
    throw e;
  }
  const stmt = db.prepare(
    'INSERT INTO expenses (name, monthly_amount, group_id, funding_allocations, funding_rules, frequency, start_date, end_date) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  );
  const result = stmt.run(
    name, monthly_amount, group_id ?? null,
    JSON.stringify(cleanAllocations(funding_allocations)),
    JSON.stringify(cleanedRules),
    normalizeFrequency(frequency), normalizedStart, null,
  );
  const row = db.prepare('SELECT * FROM expenses WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(serialize(row));
});

router.put('/:id', (req, res) => {
  const { name, monthly_amount, group_id, funding_allocations, funding_rules, frequency, start_date } = req.body;
  const { id } = req.params;
  const existing = db.prepare('SELECT * FROM expenses WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'Not found' });
  let cleanedRules = existing.funding_rules;
  let normalizedStart = existing.start_date;
  try {
    if (start_date !== undefined) normalizedStart = normalizeDate(start_date, 'start_date', { required: true });
    if (funding_rules !== undefined) cleanedRules = JSON.stringify(cleanFundingRules(funding_rules));
  } catch (e) {
    if (dateError(res, e)) return;
    throw e;
  }

  db.prepare(
    `UPDATE expenses
     SET name = ?, monthly_amount = ?, group_id = ?, funding_allocations = ?, funding_rules = ?, frequency = ?, start_date = ?, end_date = ?, updated_at = datetime('now')
     WHERE id = ?`
  ).run(
    name ?? existing.name,
    monthly_amount ?? existing.monthly_amount,
    group_id !== undefined ? (group_id ?? null) : existing.group_id,
    funding_allocations !== undefined ? JSON.stringify(cleanAllocations(funding_allocations)) : existing.funding_allocations,
    cleanedRules,
    frequency ? normalizeFrequency(frequency, existing.frequency) : existing.frequency,
    normalizedStart,
    null,
    id
  );
  const row = db.prepare('SELECT * FROM expenses WHERE id = ?').get(id);
  res.json(serialize(row));
});

router.delete('/:id', (req, res) => {
  const { id } = req.params;
  const existing = db.prepare('SELECT * FROM expenses WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'Not found' });
  db.prepare('DELETE FROM expenses WHERE id = ?').run(id);
  res.status(204).end();
});

module.exports = router;
