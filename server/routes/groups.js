const express = require('express');
const router = express.Router();
const db = require('../db/database');

const VALID_KINDS = ['income', 'expense'];

router.get('/', (req, res) => {
  const rows = db.prepare('SELECT * FROM line_item_groups ORDER BY created_at ASC').all();
  res.json(rows);
});

router.post('/', (req, res) => {
  const { name, kind } = req.body;
  if (!name || !VALID_KINDS.includes(kind)) {
    return res.status(400).json({ error: 'name and a valid kind (income|expense) are required' });
  }
  const result = db.prepare('INSERT INTO line_item_groups (name, kind) VALUES (?, ?)').run(name, kind);
  const row = db.prepare('SELECT * FROM line_item_groups WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(row);
});

router.put('/:id', (req, res) => {
  const { name } = req.body;
  const { id } = req.params;
  const existing = db.prepare('SELECT * FROM line_item_groups WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'Not found' });

  db.prepare(
    "UPDATE line_item_groups SET name = ?, updated_at = datetime('now') WHERE id = ?"
  ).run(name ?? existing.name, id);
  const row = db.prepare('SELECT * FROM line_item_groups WHERE id = ?').get(id);
  res.json(row);
});

// Deleting a group ungroups its items rather than deleting them.
router.delete('/:id', (req, res) => {
  const { id } = req.params;
  const existing = db.prepare('SELECT * FROM line_item_groups WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'Not found' });

  db.prepare('UPDATE income_sources SET group_id = NULL WHERE group_id = ?').run(id);
  db.prepare('UPDATE expenses SET group_id = NULL WHERE group_id = ?').run(id);
  db.prepare('DELETE FROM line_item_groups WHERE id = ?').run(id);
  res.status(204).end();
});

module.exports = router;
