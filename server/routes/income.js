const express = require('express');
const router = express.Router();
const db = require('../db/database');
const { reorder, ORDER_BY } = require('../lib/data');
const { normalizeDate, dateError } = require('../lib/dates');

const VALID_FREQUENCIES = ['weekly', 'biweekly', 'semimonthly', 'monthly', 'quarterly', 'annually', 'one-time'];

function normalizeFrequency(freq, fallback = 'monthly') {
  return VALID_FREQUENCIES.includes(freq) ? freq : fallback;
}

function isAmount(v) {
  return typeof v === 'number' && isFinite(v);
}

function normalizePayday(value, fallback) {
  const day = Math.trunc(Number(value));
  return Number.isFinite(day) && day >= 1 && day <= 31 ? day : fallback;
}

function isoDate(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function dateForDay(year, month, day) {
  const date = new Date(year, month, Math.min(day, new Date(year, month + 1, 0).getDate()));
  if (date.getDay() === 6) date.setDate(date.getDate() - 1);
  if (date.getDay() === 0) date.setDate(date.getDate() - 2);
  return date;
}

function currentScheduledDates(row, now = new Date()) {
  if (row.frequency !== 'semimonthly') return [];
  const dates = [
    dateForDay(now.getFullYear(), now.getMonth(), row.payday_1 || 15),
    dateForDay(now.getFullYear(), now.getMonth(), row.payday_2 || 31),
  ];
  return [...new Set(dates.map(isoDate))].filter((date) => !row.start_date || date.slice(0, 7) >= row.start_date.slice(0, 7)).sort();
}

function serialize(row) {
  const saved = db.prepare('SELECT scheduled_date, occurrence_date, status, transaction_id FROM income_occurrences WHERE income_id = ? ORDER BY scheduled_date').all(row.id);
  const byScheduled = new Map(saved.map((item) => [item.scheduled_date, item]));
  const scheduled = currentScheduledDates(row);
  if (scheduled.length) {
    const account = row.account_id != null
      ? db.prepare('SELECT plaid_account_id FROM accounts WHERE id = ?').get(row.account_id)
      : db.prepare('SELECT plaid_account_id FROM accounts ORDER BY is_primary DESC, sort_order IS NULL, sort_order, id LIMIT 1').get();
    if (account?.plaid_account_id) {
      const month = scheduled[0].slice(0, 7);
      const candidates = db.prepare(
        `SELECT transaction_id, date, name, amount, pending
         FROM plaid_transactions
         WHERE account_id = ? AND date LIKE ? AND amount < 0 AND category = 'INCOME'
         ORDER BY date, transaction_id`
      ).all(account.plaid_account_id, `${month}-%`);
      const used = new Set(saved.map((item) => item.transaction_id).filter(Boolean));
      for (const scheduledDate of scheduled) {
        if (byScheduled.has(scheduledDate)) continue;
        const expectedTime = new Date(`${scheduledDate}T12:00:00`).getTime();
        const match = candidates
          .filter((txn) => !used.has(txn.transaction_id))
          .map((txn) => ({
            txn,
            days: Math.abs(new Date(`${txn.date}T12:00:00`).getTime() - expectedTime) / 86400000,
            amountDiff: Math.abs(Math.abs(txn.amount) - row.monthly_amount),
          }))
          .filter(({ days, amountDiff }) => days <= 5 && amountDiff <= Math.max(25, row.monthly_amount * 0.15))
          .sort((a, b) => a.days - b.days || a.amountDiff - b.amountDiff)[0]?.txn;
        if (match) {
          used.add(match.transaction_id);
          byScheduled.set(scheduledDate, {
            scheduled_date: scheduledDate,
            occurrence_date: match.date,
            status: 'detected',
            transaction_id: match.transaction_id,
            transaction_name: match.name,
            transaction_amount: Math.abs(match.amount),
          });
        }
      }
    }
  }
  return { ...row, occurrences: [...byScheduled.values()] };
}

router.get('/', (req, res) => {
  const rows = db.prepare(`SELECT * FROM income_sources ${ORDER_BY}`).all();
  res.json(rows.map(serialize));
});

router.post('/reorder', (req, res) => {
  reorder(db, 'income_sources', req.body.ids);
  res.json({ ok: true });
});

router.post('/', (req, res) => {
  const { name, monthly_amount, frequency, payday_1, payday_2, group_id, start_date, account_id } = req.body;
  if (!name || !isAmount(monthly_amount) || monthly_amount < 0) {
    return res.status(400).json({ error: 'name and a non-negative numeric monthly_amount are required' });
  }
  let normalizedStart;
  try {
    normalizedStart = normalizeDate(start_date, 'start_date');
  } catch (e) {
    if (dateError(res, e)) return;
    throw e;
  }
  const stmt = db.prepare(
    'INSERT INTO income_sources (name, monthly_amount, frequency, payday_1, payday_2, group_id, start_date, account_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  );
  const normalizedFrequency = normalizeFrequency(frequency);
  const result = stmt.run(
    name, monthly_amount, normalizedFrequency,
    normalizedFrequency === 'semimonthly' ? normalizePayday(payday_1, 15) : null,
    normalizedFrequency === 'semimonthly' ? normalizePayday(payday_2, 31) : null,
    group_id ?? null, normalizedStart, account_id ?? null,
  );
  const row = db.prepare('SELECT * FROM income_sources WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(serialize(row));
});

router.put('/:id', (req, res) => {
  const { name, monthly_amount, frequency, payday_1, payday_2, group_id, start_date, account_id } = req.body;
  const { id } = req.params;
  const existing = db.prepare('SELECT * FROM income_sources WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'Not found' });
  let normalizedStart = existing.start_date;
  if (start_date !== undefined) {
    try {
      normalizedStart = normalizeDate(start_date, 'start_date');
    } catch (e) {
      if (dateError(res, e)) return;
      throw e;
    }
  }

  const normalizedFrequency = frequency ? normalizeFrequency(frequency, existing.frequency) : existing.frequency;
  db.prepare(
    `UPDATE income_sources
     SET name = ?, monthly_amount = ?, frequency = ?, payday_1 = ?, payday_2 = ?, group_id = ?, start_date = ?, account_id = ?, updated_at = datetime('now')
     WHERE id = ?`
  ).run(
    name ?? existing.name,
    monthly_amount ?? existing.monthly_amount,
    normalizedFrequency,
    normalizedFrequency === 'semimonthly' ? normalizePayday(payday_1 ?? existing.payday_1, 15) : null,
    normalizedFrequency === 'semimonthly' ? normalizePayday(payday_2 ?? existing.payday_2, 31) : null,
    group_id !== undefined ? (group_id ?? null) : existing.group_id,
    normalizedStart,
    account_id !== undefined ? (account_id ?? null) : existing.account_id,
    id
  );
  const row = db.prepare('SELECT * FROM income_sources WHERE id = ?').get(id);
  res.json(serialize(row));
});

router.put('/:id/occurrences/:scheduledDate', (req, res) => {
  const { id, scheduledDate } = req.params;
  const existing = db.prepare('SELECT * FROM income_sources WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'Not found' });
  let occurrenceDate;
  try {
    occurrenceDate = normalizeDate(req.body.occurrence_date || scheduledDate, 'occurrence_date', { required: true });
  } catch (e) {
    if (dateError(res, e)) return;
    throw e;
  }
  if (occurrenceDate.slice(0, 7) !== scheduledDate.slice(0, 7)) {
    return res.status(400).json({ error: 'An adjusted payday must remain in the same month' });
  }
  const status = ['expected', 'received', 'skipped'].includes(req.body.status) ? req.body.status : 'expected';
  db.prepare(
    `INSERT INTO income_occurrences (income_id, scheduled_date, occurrence_date, status, transaction_id)
     VALUES (?, ?, ?, ?, NULL)
     ON CONFLICT(income_id, scheduled_date) DO UPDATE SET
       occurrence_date = excluded.occurrence_date, status = excluded.status, transaction_id = NULL, updated_at = datetime('now')`
  ).run(id, scheduledDate, occurrenceDate, status);
  res.json(serialize(db.prepare('SELECT * FROM income_sources WHERE id = ?').get(id)));
});

router.delete('/:id/occurrences/:scheduledDate', (req, res) => {
  const { id, scheduledDate } = req.params;
  const existing = db.prepare('SELECT * FROM income_sources WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'Not found' });
  db.prepare('DELETE FROM income_occurrences WHERE income_id = ? AND scheduled_date = ?').run(id, scheduledDate);
  res.json(serialize(existing));
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
