const express = require('express');
const router = express.Router();
const db = require('../db/database');
const { reorder, ORDER_BY } = require('../lib/data');

function isAmount(v) {
  return typeof v === 'number' && isFinite(v);
}

router.get('/', (req, res) => {
  const rows = db.prepare(`SELECT * FROM expenses ${ORDER_BY}`).all();
  res.json(rows);
});

router.post('/reorder', (req, res) => {
  reorder(db, 'expenses', req.body.ids);
  res.json({ ok: true });
});

router.post('/', (req, res) => {
  const { name, monthly_amount, group_id } = req.body;
  if (!name || !isAmount(monthly_amount) || monthly_amount < 0) {
    return res.status(400).json({ error: 'name and a non-negative numeric monthly_amount are required' });
  }
  const stmt = db.prepare(
    'INSERT INTO expenses (name, monthly_amount, group_id) VALUES (?, ?, ?)'
  );
  const result = stmt.run(name, monthly_amount, group_id ?? null);
  const row = db.prepare('SELECT * FROM expenses WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(row);
});

router.put('/:id', (req, res) => {
  const { name, monthly_amount, group_id } = req.body;
  const { id } = req.params;
  const existing = db.prepare('SELECT * FROM expenses WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'Not found' });

  db.prepare(
    `UPDATE expenses
     SET name = ?, monthly_amount = ?, group_id = ?, updated_at = datetime('now')
     WHERE id = ?`
  ).run(
    name ?? existing.name,
    monthly_amount ?? existing.monthly_amount,
    group_id !== undefined ? (group_id ?? null) : existing.group_id,
    id
  );
  const row = db.prepare('SELECT * FROM expenses WHERE id = ?').get(id);
  res.json(row);
});

router.delete('/:id', (req, res) => {
  const { id } = req.params;
  const existing = db.prepare('SELECT * FROM expenses WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'Not found' });
  db.prepare('DELETE FROM expenses WHERE id = ?').run(id);
  res.status(204).end();
});

module.exports = router;
