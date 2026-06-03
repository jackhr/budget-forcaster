const express = require('express');
const router = express.Router();
const db = require('../db/database');
const { reorder, ORDER_BY } = require('../lib/data');

const VALID_FREQUENCIES = ['weekly', 'biweekly', 'monthly', 'quarterly', 'annually', 'one-time'];

function normalizeFrequency(freq, fallback = 'monthly') {
  return VALID_FREQUENCIES.includes(freq) ? freq : fallback;
}

function isAmount(v) {
  return typeof v === 'number' && isFinite(v);
}

router.get('/', (req, res) => {
  const rows = db.prepare(`SELECT * FROM income_sources ${ORDER_BY}`).all();
  res.json(rows);
});

router.post('/reorder', (req, res) => {
  reorder(db, 'income_sources', req.body.ids);
  res.json({ ok: true });
});

router.post('/', (req, res) => {
  const { name, monthly_amount, frequency, group_id } = req.body;
  if (!name || !isAmount(monthly_amount) || monthly_amount < 0) {
    return res.status(400).json({ error: 'name and a non-negative numeric monthly_amount are required' });
  }
  const stmt = db.prepare(
    'INSERT INTO income_sources (name, monthly_amount, frequency, group_id) VALUES (?, ?, ?, ?)'
  );
  const result = stmt.run(name, monthly_amount, normalizeFrequency(frequency), group_id ?? null);
  const row = db.prepare('SELECT * FROM income_sources WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(row);
});

router.put('/:id', (req, res) => {
  const { name, monthly_amount, frequency, group_id } = req.body;
  const { id } = req.params;
  const existing = db.prepare('SELECT * FROM income_sources WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'Not found' });

  db.prepare(
    `UPDATE income_sources
     SET name = ?, monthly_amount = ?, frequency = ?, group_id = ?, updated_at = datetime('now')
     WHERE id = ?`
  ).run(
    name ?? existing.name,
    monthly_amount ?? existing.monthly_amount,
    frequency ? normalizeFrequency(frequency, existing.frequency) : existing.frequency,
    group_id !== undefined ? (group_id ?? null) : existing.group_id,
    id
  );
  const row = db.prepare('SELECT * FROM income_sources WHERE id = ?').get(id);
  res.json(row);
});

router.delete('/:id', (req, res) => {
  const { id } = req.params;
  const existing = db.prepare('SELECT * FROM income_sources WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'Not found' });
  // Any future expense funded by this income falls back to cash.
  db.prepare(
    "UPDATE scheduled_payments SET funding_source_type = 'cash', funding_source_id = NULL WHERE funding_source_type = 'income' AND funding_source_id = ?"
  ).run(id);
  db.prepare('DELETE FROM income_sources WHERE id = ?').run(id);
  res.status(204).end();
});

module.exports = router;
