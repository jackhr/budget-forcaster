const express = require('express');
const router = express.Router();
const db = require('../db/database');
const { normalizeDate, dateError } = require('../lib/dates');

const VALID_FREQUENCIES = ['weekly', 'biweekly', 'monthly', 'quarterly', 'annually', 'one-time'];
const VALID_FUNDING = ['cash', 'income', 'debt', 'account'];

function normalizeFrequency(freq, fallback = 'one-time') {
  return VALID_FREQUENCIES.includes(freq) ? freq : fallback;
}

function normalizeFunding(type, fallback = 'cash') {
  return VALID_FUNDING.includes(type) ? type : fallback;
}

router.get('/', (req, res) => {
  const rows = db.prepare('SELECT * FROM scheduled_payments ORDER BY start_date ASC').all();
  res.json(rows);
});

router.post('/', (req, res) => {
  const { name, amount, frequency, start_date, end_date, funding_source_type, funding_source_id } = req.body;
  if (!name || amount == null || !start_date) {
    return res.status(400).json({ error: 'name, amount and start_date are required' });
  }
  let normalizedStart;
  let normalizedEnd;
  try {
    normalizedStart = normalizeDate(start_date, 'start_date', { required: true });
    normalizedEnd = normalizeDate(end_date, 'end_date');
  } catch (e) {
    if (dateError(res, e)) return;
    throw e;
  }
  const fundingType = normalizeFunding(funding_source_type);
  const fundingId = fundingType === 'cash' ? null : (funding_source_id ?? null);
  const stmt = db.prepare(
    'INSERT INTO scheduled_payments (name, amount, frequency, start_date, end_date, funding_source_type, funding_source_id) VALUES (?, ?, ?, ?, ?, ?, ?)'
  );
  const result = stmt.run(name, amount, normalizeFrequency(frequency), normalizedStart, normalizedEnd, fundingType, fundingId);
  const row = db.prepare('SELECT * FROM scheduled_payments WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(row);
});

router.put('/:id', (req, res) => {
  const { name, amount, frequency, start_date, end_date, funding_source_type, funding_source_id } = req.body;
  const { id } = req.params;
  const existing = db.prepare('SELECT * FROM scheduled_payments WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'Not found' });
  let normalizedStart = existing.start_date;
  let normalizedEnd = existing.end_date;
  try {
    if (start_date !== undefined) normalizedStart = normalizeDate(start_date, 'start_date', { required: true });
    if (end_date !== undefined) normalizedEnd = normalizeDate(end_date, 'end_date');
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
     SET name = ?, amount = ?, frequency = ?, start_date = ?, end_date = ?, funding_source_type = ?, funding_source_id = ?, updated_at = datetime('now')
     WHERE id = ?`
  ).run(
    name ?? existing.name,
    amount ?? existing.amount,
    frequency ? normalizeFrequency(frequency, existing.frequency) : existing.frequency,
    normalizedStart,
    normalizedEnd,
    fundingType,
    fundingId,
    id
  );
  const row = db.prepare('SELECT * FROM scheduled_payments WHERE id = ?').get(id);
  res.json(row);
});

router.delete('/:id', (req, res) => {
  const { id } = req.params;
  const existing = db.prepare('SELECT * FROM scheduled_payments WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'Not found' });
  db.prepare('DELETE FROM scheduled_payments WHERE id = ?').run(id);
  res.status(204).end();
});

module.exports = router;
