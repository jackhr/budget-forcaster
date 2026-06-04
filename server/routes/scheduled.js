const express = require('express');
const router = express.Router();
const db = require('../db/database');
const { normalizeDate, dateError } = require('../lib/dates');

const VALID_FREQUENCIES = ['weekly', 'biweekly', 'monthly', 'quarterly', 'annually', 'one-time'];
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

function cleanAllocations(input) {
  if (!Array.isArray(input)) return [];
  const out = [];
  for (const a of input) {
    if (!a || (a.source_type !== 'account' && a.source_type !== 'debt')) continue;
    if (a.alloc_type !== 'percent' && a.alloc_type !== 'fixed') continue;
    if (!isAmount(a.value) || a.value < 0) continue;
    out.push({
      source_type: a.source_type,
      source_id: a.source_id == null ? null : Number(a.source_id),
      alloc_type: a.alloc_type,
      value: a.value,
    });
  }
  return out;
}

function serialize(row) {
  return { ...row, funding_allocations: JSON.parse(row.funding_allocations || '[]') };
}

router.get('/', (req, res) => {
  const rows = db.prepare('SELECT * FROM scheduled_payments ORDER BY start_date ASC').all();
  res.json(rows.map(serialize));
});

router.post('/', (req, res) => {
  const { name, amount, frequency, start_date, end_date, funding_source_type, funding_source_id, funding_allocations } = req.body;
  if (!name || !isAmount(amount) || amount < 0 || !start_date) {
    return res.status(400).json({ error: 'name, a non-negative numeric amount and start_date are required' });
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
  const allocations = cleanAllocations(funding_allocations);
  const stmt = db.prepare(
    'INSERT INTO scheduled_payments (name, amount, frequency, start_date, end_date, funding_source_type, funding_source_id, funding_allocations) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  );
  const result = stmt.run(name, amount, normalizeFrequency(frequency), normalizedStart, normalizedEnd, fundingType, fundingId, JSON.stringify(allocations));
  const row = db.prepare('SELECT * FROM scheduled_payments WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(serialize(row));
});

router.put('/:id', (req, res) => {
  const { name, amount, frequency, start_date, end_date, funding_source_type, funding_source_id, funding_allocations } = req.body;
  const { id } = req.params;
  const existing = db.prepare('SELECT * FROM scheduled_payments WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'Not found' });
  if (amount !== undefined && (!isAmount(amount) || amount < 0)) {
    return res.status(400).json({ error: 'amount must be a non-negative number' });
  }
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
     SET name = ?, amount = ?, frequency = ?, start_date = ?, end_date = ?, funding_source_type = ?, funding_source_id = ?, funding_allocations = ?, updated_at = datetime('now')
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
