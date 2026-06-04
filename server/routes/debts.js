const express = require('express');
const router = express.Router();
const db = require('../db/database');
const { reorder, removeFundingAllocations, ORDER_BY } = require('../lib/data');

function isAmount(v) {
  return typeof v === 'number' && isFinite(v);
}

function cleanAllocations(input) {
  if (!Array.isArray(input)) return [];
  const out = [];
  for (const a of input) {
    if (!a || a.source_type !== 'account') continue;
    if (a.alloc_type !== 'percent' && a.alloc_type !== 'fixed') continue;
    if (!isAmount(a.value) || a.value < 0) continue;
    out.push({
      source_type: 'account',
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
  const rows = db.prepare(`SELECT * FROM debts ${ORDER_BY}`).all();
  res.json(rows.map(serialize));
});

router.post('/reorder', (req, res) => {
  reorder(db, 'debts', req.body.ids);
  res.json({ ok: true });
});

router.post('/', (req, res) => {
  const { name, balance, apr, credit_limit, monthly_payment, group_id, account_id, funding_allocations } = req.body;
  if (!name || !isAmount(balance) || balance < 0 || !isAmount(monthly_payment) || monthly_payment < 0) {
    return res.status(400).json({ error: 'name, a non-negative balance and monthly_payment are required' });
  }
  const stmt = db.prepare(
    'INSERT INTO debts (name, balance, apr, credit_limit, monthly_payment, group_id, account_id, funding_allocations) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  );
  const result = stmt.run(
    name, balance, apr ?? 0, credit_limit ?? null, monthly_payment, group_id ?? null, account_id ?? null,
    JSON.stringify(cleanAllocations(funding_allocations)),
  );
  const row = db.prepare('SELECT * FROM debts WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(serialize(row));
});

router.put('/:id', (req, res) => {
  const { name, balance, apr, credit_limit, monthly_payment, group_id, account_id, funding_allocations } = req.body;
  const { id } = req.params;
  const existing = db.prepare('SELECT * FROM debts WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'Not found' });

  db.prepare(
    `UPDATE debts
     SET name = ?, balance = ?, apr = ?, credit_limit = ?, monthly_payment = ?, group_id = ?, account_id = ?, funding_allocations = ?, updated_at = datetime('now')
     WHERE id = ?`
  ).run(
    name ?? existing.name,
    balance ?? existing.balance,
    apr ?? existing.apr,
    credit_limit !== undefined ? (credit_limit ?? null) : existing.credit_limit,
    monthly_payment ?? existing.monthly_payment,
    group_id !== undefined ? (group_id ?? null) : existing.group_id,
    account_id !== undefined ? (account_id ?? null) : existing.account_id,
    funding_allocations !== undefined ? JSON.stringify(cleanAllocations(funding_allocations)) : existing.funding_allocations,
    id
  );
  const row = db.prepare('SELECT * FROM debts WHERE id = ?').get(id);
  res.json(serialize(row));
});

router.delete('/:id', (req, res) => {
  const { id } = req.params;
  const existing = db.prepare('SELECT * FROM debts WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'Not found' });
  // Any future expense funded by this debt falls back to cash.
  db.prepare(
    "UPDATE scheduled_payments SET funding_source_type = 'cash', funding_source_id = NULL WHERE funding_source_type = 'debt' AND funding_source_id = ?"
  ).run(id);
  removeFundingAllocations(db, 'expenses', 'debt', id);
  removeFundingAllocations(db, 'scheduled_payments', 'debt', id);
  db.prepare('DELETE FROM debts WHERE id = ?').run(id);
  res.status(204).end();
});

module.exports = router;
