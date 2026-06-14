const express = require('express');
const router = express.Router();
const db = require('../db/database');
const { normalizeDate, dateError } = require('../lib/dates');
const { cleanAllocations, cleanFundingRules, parseJsonArray } = require('../lib/funding');

const VALID_FREQUENCIES = ['weekly', 'biweekly', 'semimonthly', 'monthly', 'quarterly', 'annually', 'one-time'];
const VALID_FUNDING = ['cash', 'income', 'debt', 'account'];

function isAmount(v) {
  return typeof v === 'number' && isFinite(v);
}

function normalizeFrequency(freq, fallback = 'one-time') {
  return VALID_FREQUENCIES.includes(freq) ? freq : fallback;
}

function normalizeFunding(type, fallback = 'cash') {
  return VALID_FUNDING.includes(type) ? type : fallback;
}

function serialize(row) {
  return {
    ...row,
    funding_allocations: parseJsonArray(row.funding_allocations),
    funding_rules: parseJsonArray(row.funding_rules),
  };
}

router.get('/', (req, res) => {
  const rows = db.prepare('SELECT * FROM scheduled_payments ORDER BY start_date ASC').all();
  res.json(rows.map(serialize));
});

router.post('/', (req, res) => {
  const { name, amount, frequency, start_date, end_date, funding_source_type, funding_source_id, funding_allocations, funding_rules } = req.body;
  if (!name || !isAmount(amount) || amount < 0 || !start_date) {
    return res.status(400).json({ error: 'name, a non-negative numeric amount and start_date are required' });
  }
  let normalizedStart;
  let normalizedEnd;
  let cleanedRules;
  try {
    normalizedStart = normalizeDate(start_date, 'start_date', { required: true });
    normalizedEnd = normalizeDate(end_date, 'end_date');
    cleanedRules = cleanFundingRules(funding_rules);
  } catch (e) {
    if (dateError(res, e)) return;
    throw e;
  }
  const fundingType = normalizeFunding(funding_source_type);
  const fundingId = fundingType === 'cash' ? null : (funding_source_id ?? null);
  const allocations = cleanAllocations(funding_allocations);
  const stmt = db.prepare(
    'INSERT INTO scheduled_payments (name, amount, frequency, start_date, end_date, funding_source_type, funding_source_id, funding_allocations, funding_rules) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
  );
  const result = stmt.run(name, amount, normalizeFrequency(frequency), normalizedStart, normalizedEnd, fundingType, fundingId, JSON.stringify(allocations), JSON.stringify(cleanedRules));
  const row = db.prepare('SELECT * FROM scheduled_payments WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(serialize(row));
});

router.put('/:id', (req, res) => {
  const { name, amount, frequency, start_date, end_date, funding_source_type, funding_source_id, funding_allocations, funding_rules } = req.body;
  const { id } = req.params;
  const existing = db.prepare('SELECT * FROM scheduled_payments WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'Not found' });
  if (amount !== undefined && (!isAmount(amount) || amount < 0)) {
    return res.status(400).json({ error: 'amount must be a non-negative number' });
  }
  let normalizedStart = existing.start_date;
  let normalizedEnd = existing.end_date;
  let cleanedRules = existing.funding_rules;
  try {
    if (start_date !== undefined) normalizedStart = normalizeDate(start_date, 'start_date', { required: true });
    if (end_date !== undefined) normalizedEnd = normalizeDate(end_date, 'end_date');
    if (funding_rules !== undefined) cleanedRules = JSON.stringify(cleanFundingRules(funding_rules));
  } catch (e) {
    if (dateError(res, e)) return;
    throw e;
  }

  const fundingType = funding_source_type !== undefined
    ? normalizeFunding(funding_source_type, existing.funding_source_type)
    : existing.funding_source_type;
  let fundingId;
  if (funding_source_type !== undefined || funding_source_id !== undefined) {
    fundingId = fundingType === 'cash' ? null : (funding_source_id ?? (funding_source_type !== undefined ? null : existing.funding_source_id));
  } else {
    fundingId = existing.funding_source_id;
  }

  db.prepare(
    `UPDATE scheduled_payments
     SET name = ?, amount = ?, frequency = ?, start_date = ?, end_date = ?, funding_source_type = ?, funding_source_id = ?, funding_allocations = ?, funding_rules = ?, updated_at = datetime('now')
     WHERE id = ?`
  ).run(
    name ?? existing.name,
    amount ?? existing.amount,
    frequency ? normalizeFrequency(frequency, existing.frequency) : existing.frequency,
    normalizedStart,
    normalizedEnd,
    fundingType,
    fundingId,
    funding_allocations !== undefined ? JSON.stringify(cleanAllocations(funding_allocations)) : existing.funding_allocations,
    cleanedRules,
    id
  );
  const row = db.prepare('SELECT * FROM scheduled_payments WHERE id = ?').get(id);
  res.json(serialize(row));
});

router.delete('/:id', (req, res) => {
  const { id } = req.params;
  const existing = db.prepare('SELECT * FROM scheduled_payments WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'Not found' });
  db.prepare('DELETE FROM scheduled_payments WHERE id = ?').run(id);
  res.status(204).end();
});

module.exports = router;
