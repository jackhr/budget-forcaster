const express = require('express');
const router = express.Router();
const db = require('../db/database');
const { reorder, ORDER_BY } = require('../lib/data');

const VALID_KINDS = ['income', 'expense', 'debt'];

router.get('/', (req, res) => {
  const rows = db.prepare(`SELECT * FROM line_item_groups WHERE user_id = ? ${ORDER_BY}`).all(req.user.id);
  res.json(rows);
});

router.post('/reorder', (req, res) => {
  reorder(db, 'line_item_groups', req.body.ids, req.user.id);
  res.json({ ok: true });
});

router.post('/', (req, res) => {
  const { name, kind } = req.body;
  if (!name || !VALID_KINDS.includes(kind)) {
    return res.status(400).json({ error: 'name and a valid kind (income|expense) are required' });
  }
  const result = db.prepare('INSERT INTO line_item_groups (user_id, name, kind) VALUES (?, ?, ?)')
    .run(req.user.id, name, kind);
  const row = db.prepare('SELECT * FROM line_item_groups WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(row);
});

router.put('/:id', (req, res) => {
  const { name } = req.body;
  const { id } = req.params;
  const existing = db.prepare('SELECT * FROM line_item_groups WHERE id = ? AND user_id = ?').get(id, req.user.id);
  if (!existing) return res.status(404).json({ error: 'Not found' });

  db.prepare(
    "UPDATE line_item_groups SET name = ?, updated_at = datetime('now') WHERE id = ? AND user_id = ?"
  ).run(name ?? existing.name, id, req.user.id);
  const row = db.prepare('SELECT * FROM line_item_groups WHERE id = ?').get(id);
  res.json(row);
});

// Deleting a group ungroups its items rather than deleting them.
router.delete('/:id', (req, res) => {
  const { id } = req.params;
  const existing = db.prepare('SELECT * FROM line_item_groups WHERE id = ? AND user_id = ?').get(id, req.user.id);
  if (!existing) return res.status(404).json({ error: 'Not found' });

  for (const table of ['income_sources', 'expenses', 'debts']) {
    db.prepare(`UPDATE ${table} SET group_id = NULL WHERE group_id = ? AND user_id = ?`).run(id, req.user.id);
  }
  db.prepare('DELETE FROM line_item_groups WHERE id = ? AND user_id = ?').run(id, req.user.id);
  res.status(204).end();
});

module.exports = router;
