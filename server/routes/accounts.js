const express = require('express');
const router = express.Router();
const db = require('../db/database');
const { reorder, removeFundingAllocations, ORDER_BY } = require('../lib/data');

function isAmount(v) {
  return typeof v === 'number' && isFinite(v);
}

// Guarantee exactly one primary account when any exist.
function ensurePrimary() {
  const rows = db.prepare('SELECT id, is_primary FROM accounts ORDER BY COALESCE(sort_order, 1000000000), id').all();
  if (rows.length === 0) return;
  const primaries = rows.filter((r) => r.is_primary);
  if (primaries.length === 1) return;
  db.prepare('UPDATE accounts SET is_primary = 0').run();
  db.prepare('UPDATE accounts SET is_primary = 1 WHERE id = ?').run(rows[0].id);
}

function setPrimary(id) {
  db.prepare('UPDATE accounts SET is_primary = 0').run();
  db.prepare('UPDATE accounts SET is_primary = 1 WHERE id = ?').run(id);
}

router.get('/', (req, res) => {
  const rows = db.prepare(`SELECT * FROM accounts ${ORDER_BY}`).all();
  res.json(rows);
});

router.post('/reorder', (req, res) => {
  reorder(db, 'accounts', req.body.ids);
  res.json({ ok: true });
});

router.post('/', (req, res) => {
  const { name, balance, is_primary } = req.body;
  if (!name || !isAmount(balance)) {
    return res.status(400).json({ error: 'name and a numeric balance are required' });
  }
  const count = db.prepare('SELECT COUNT(*) as c FROM accounts').get().c;
  const result = db.prepare('INSERT INTO accounts (name, balance, is_primary) VALUES (?, ?, ?)')
    .run(name, balance, is_primary || count === 0 ? 1 : 0);
  if (is_primary || count === 0) setPrimary(result.lastInsertRowid);
  ensurePrimary();
  const row = db.prepare('SELECT * FROM accounts WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(row);
});

router.put('/:id', (req, res) => {
  const { name, balance, is_primary } = req.body;
  const { id } = req.params;
  const existing = db.prepare('SELECT * FROM accounts WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'Not found' });

  db.prepare(
    "UPDATE accounts SET name = ?, balance = ?, updated_at = datetime('now') WHERE id = ?"
  ).run(name ?? existing.name, balance ?? existing.balance, id);
  if (is_primary) setPrimary(id);
  ensurePrimary();
  const row = db.prepare('SELECT * FROM accounts WHERE id = ?').get(id);
  res.json(row);
});

router.delete('/:id', (req, res) => {
  const { id } = req.params;
  const existing = db.prepare('SELECT * FROM accounts WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'Not found' });
  const count = db.prepare('SELECT COUNT(*) as c FROM accounts').get().c;
  if (count <= 1) return res.status(400).json({ error: 'At least one account is required' });

  // Income assigned here falls back to the primary account.
  db.prepare('UPDATE income_sources SET account_id = NULL WHERE account_id = ?').run(id);
  // Future expenses paid from this account fall back to cash (= primary).
  db.prepare(
    "UPDATE scheduled_payments SET funding_source_type = 'cash', funding_source_id = NULL WHERE funding_source_type = 'account' AND funding_source_id = ?"
  ).run(id);
  removeFundingAllocations(db, 'expenses', 'account', id);
  removeFundingAllocations(db, 'scheduled_payments', 'account', id);
  // Debts paid from this account fall back to the primary account.
  db.prepare('UPDATE debts SET account_id = NULL WHERE account_id = ?').run(id);
  db.prepare('DELETE FROM accounts WHERE id = ?').run(id);
  ensurePrimary();
  res.status(204).end();
});

module.exports = router;
