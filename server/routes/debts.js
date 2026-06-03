const express = require('express');
const router = express.Router();
const db = require('../db/database');

router.get('/', (req, res) => {
  const rows = db.prepare('SELECT * FROM debts ORDER BY created_at ASC').all();
  res.json(rows);
});

router.post('/', (req, res) => {
  const { name, balance, apr, credit_limit, monthly_payment } = req.body;
  if (!name || balance == null || monthly_payment == null) {
    return res.status(400).json({ error: 'name, balance and monthly_payment are required' });
  }
  const stmt = db.prepare(
    'INSERT INTO debts (name, balance, apr, credit_limit, monthly_payment) VALUES (?, ?, ?, ?, ?)'
  );
  const result = stmt.run(name, balance, apr ?? 0, credit_limit ?? null, monthly_payment);
  const row = db.prepare('SELECT * FROM debts WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(row);
});

router.put('/:id', (req, res) => {
  const { name, balance, apr, credit_limit, monthly_payment } = req.body;
  const { id } = req.params;
  const existing = db.prepare('SELECT * FROM debts WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'Not found' });

  db.prepare(
    `UPDATE debts
     SET name = ?, balance = ?, apr = ?, credit_limit = ?, monthly_payment = ?, updated_at = datetime('now')
     WHERE id = ?`
  ).run(
    name ?? existing.name,
    balance ?? existing.balance,
    apr ?? existing.apr,
    credit_limit !== undefined ? (credit_limit ?? null) : existing.credit_limit,
    monthly_payment ?? existing.monthly_payment,
    id
  );
  const row = db.prepare('SELECT * FROM debts WHERE id = ?').get(id);
  res.json(row);
});

router.delete('/:id', (req, res) => {
  const { id } = req.params;
  const existing = db.prepare('SELECT * FROM debts WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'Not found' });
  db.prepare('DELETE FROM debts WHERE id = ?').run(id);
  res.status(204).end();
});

module.exports = router;
