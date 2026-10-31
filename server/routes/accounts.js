const express = require('express');
const router = express.Router();
const db = require('../db/database');
const { reorder, removeFundingAllocations, ORDER_BY } = require('../lib/data');

function isAmount(v) {
  return typeof v === 'number' && isFinite(v);
}

// Guarantee exactly one primary account per user when any exist.
function ensurePrimary(userId) {
  const rows = db.prepare(
    'SELECT id, is_primary FROM accounts WHERE user_id = ? ORDER BY COALESCE(sort_order, 1000000000), id'
  ).all(userId);
  if (rows.length === 0) return;
  const primaries = rows.filter((r) => r.is_primary);
  if (primaries.length === 1) return;
  setPrimary(rows[0].id, userId);
}

function setPrimary(id, userId) {
  db.prepare('UPDATE accounts SET is_primary = 0 WHERE user_id = ?').run(userId);
  db.prepare('UPDATE accounts SET is_primary = 1 WHERE id = ? AND user_id = ?').run(id, userId);
}

router.get('/', (req, res) => {
  const rows = db.prepare(`SELECT * FROM accounts WHERE user_id = ? ${ORDER_BY}`).all(req.user.id);
  res.json(rows);
});

router.post('/reorder', (req, res) => {
  reorder(db, 'accounts', req.body.ids, req.user.id);
  res.json({ ok: true });
});

router.post('/', (req, res) => {
  const { name, balance, is_primary } = req.body;
  if (!name || !isAmount(balance)) {
    return res.status(400).json({ error: 'name and a numeric balance are required' });
  }
  const count = db.prepare('SELECT COUNT(*) as c FROM accounts WHERE user_id = ?').get(req.user.id).c;
  const result = db.prepare('INSERT INTO accounts (user_id, name, balance, is_primary) VALUES (?, ?, ?, ?)')
    .run(req.user.id, name, balance, is_primary || count === 0 ? 1 : 0);
  if (is_primary || count === 0) setPrimary(result.lastInsertRowid, req.user.id);
  ensurePrimary(req.user.id);
  const row = db.prepare('SELECT * FROM accounts WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(row);
});

router.put('/:id', (req, res) => {
  const { name, balance, is_primary } = req.body;
  const { id } = req.params;
  const existing = db.prepare('SELECT * FROM accounts WHERE id = ? AND user_id = ?').get(id, req.user.id);
  if (!existing) return res.status(404).json({ error: 'Not found' });

  db.prepare(
    "UPDATE accounts SET name = ?, balance = ?, updated_at = datetime('now') WHERE id = ? AND user_id = ?"
  ).run(name ?? existing.name, balance ?? existing.balance, id, req.user.id);
  if (is_primary) setPrimary(id, req.user.id);
  ensurePrimary(req.user.id);
  const row = db.prepare('SELECT * FROM accounts WHERE id = ?').get(id);
  res.json(row);
});

router.delete('/:id', (req, res) => {
  const { id } = req.params;
  const existing = db.prepare('SELECT * FROM accounts WHERE id = ? AND user_id = ?').get(id, req.user.id);
  if (!existing) return res.status(404).json({ error: 'Not found' });
  const count = db.prepare('SELECT COUNT(*) as c FROM accounts WHERE user_id = ?').get(req.user.id).c;
  if (count <= 1) return res.status(400).json({ error: 'At least one account is required' });

  // Income assigned here falls back to the primary account.
  db.prepare('UPDATE income_sources SET account_id = NULL WHERE account_id = ? AND user_id = ?').run(id, req.user.id);
  removeFundingAllocations(db, 'expenses', 'account', id, req.user.id);
  removeFundingAllocations(db, 'debts', 'account', id, req.user.id);
  // Debts paid from this account fall back to the primary account.
  db.prepare('UPDATE debts SET account_id = NULL WHERE account_id = ? AND user_id = ?').run(id, req.user.id);
  db.prepare('DELETE FROM accounts WHERE id = ? AND user_id = ?').run(id, req.user.id);
  ensurePrimary(req.user.id);
  res.status(204).end();
});

module.exports = router;
