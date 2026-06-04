const express = require('express');
const router = express.Router();
const db = require('../db/database');
const { reorder, ORDER_BY } = require('../lib/data');

function isAmount(v) {
  return typeof v === 'number' && isFinite(v);
}

// Validate + normalize the funding allocations array.
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
  const rows = db.prepare(`SELECT * FROM expenses ${ORDER_BY}`).all();
  res.json(rows.map(serialize));
});

router.post('/reorder', (req, res) => {
  reorder(db, 'expenses', req.body.ids);
  res.json({ ok: true });
});

router.post('/', (req, res) => {
  const { name, monthly_amount, group_id, funding_allocations } = req.body;
  if (!name || !isAmount(monthly_amount) || monthly_amount < 0) {
    return res.status(400).json({ error: 'name and a non-negative numeric monthly_amount are required' });
  }
  const stmt = db.prepare(
    'INSERT INTO expenses (name, monthly_amount, group_id, funding_allocations) VALUES (?, ?, ?, ?)'
  );
  const result = stmt.run(name, monthly_amount, group_id ?? null, JSON.stringify(cleanAllocations(funding_allocations)));
  const row = db.prepare('SELECT * FROM expenses WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(serialize(row));
});

router.put('/:id', (req, res) => {
  const { name, monthly_amount, group_id, funding_allocations } = req.body;
  const { id } = req.params;
  const existing = db.prepare('SELECT * FROM expenses WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'Not found' });

  db.prepare(
    `UPDATE expenses
     SET name = ?, monthly_amount = ?, group_id = ?, funding_allocations = ?, updated_at = datetime('now')
     WHERE id = ?`
  ).run(
    name ?? existing.name,
    monthly_amount ?? existing.monthly_amount,
    group_id !== undefined ? (group_id ?? null) : existing.group_id,
    funding_allocations !== undefined ? JSON.stringify(cleanAllocations(funding_allocations)) : existing.funding_allocations,
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
