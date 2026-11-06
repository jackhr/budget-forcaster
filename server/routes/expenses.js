const express = require('express');
const router = express.Router();
const db = require('../db/database');
const { reorder, ORDER_BY } = require('../lib/data');
const { normalizeDate, dateError } = require('../lib/dates');
const { cleanAllocations, cleanFundingRules, parseJsonArray } = require('../lib/funding');
const { cleanCategories, parseCategories, monthBounds, spentIn, categorySummary } = require('../lib/budgets');

const VALID_FREQUENCIES = ['weekly', 'biweekly', 'semimonthly', 'monthly', 'quarterly', 'annually', 'one-time'];

function normalizeFrequency(freq, fallback = 'monthly') {
  return VALID_FREQUENCIES.includes(freq) ? freq : fallback;
}

function isAmount(v) {
  return typeof v === 'number' && isFinite(v);
}

// A one-time expense has a single occurrence, so an end date is meaningless.
function endDateFor(frequency, endDate) {
  return frequency === 'one-time' ? null : normalizeDate(endDate, 'end_date');
}

// An end date before the first occurrence would silently produce an expense that never bills.
function rangeError(res, startDate, endDate) {
  if (startDate && endDate && endDate < startDate) {
    res.status(400).json({ error: 'end_date must be on or after start_date' });
    return true;
  }
  return false;
}

// A budget's categories, and what's already been spent in them this month.
// The spend is what lets the forecast bill only the rest of the budget in
// month 0, the same way a "paid this month" flag skips a bill.
function serialize(row, userId) {
  const categories = parseCategories(row.budget_categories);
  return {
    ...row,
    funding_allocations: parseJsonArray(row.funding_allocations),
    funding_rules: parseJsonArray(row.funding_rules),
    budget_categories: categories,
    spent_this_month: row.is_budget ? spentIn(db, userId, categories, monthBounds()) : null,
  };
}

// A budget is a monthly spending limit; any other cadence has no "this month's
// share" to track against.
function budgetFields(body, existing) {
  const isBudget = body.is_budget !== undefined ? (body.is_budget ? 1 : 0) : (existing?.is_budget ?? 0);
  const categories = body.budget_categories !== undefined
    ? cleanCategories(body.budget_categories)
    : parseCategories(existing?.budget_categories);
  return { isBudget, categories: isBudget ? categories : [] };
}

router.get('/', (req, res) => {
  const rows = db.prepare(`SELECT * FROM expenses WHERE user_id = ? ${ORDER_BY}`).all(req.user.id);
  res.json(rows.map((row) => serialize(row, req.user.id)));
});

// Spending categories seen in this user's synced transactions, for picking a
// budget's categories. Empty when no bank is linked.
router.get('/budget-categories', (req, res) => {
  res.json(categorySummary(db, req.user.id));
});

router.post('/reorder', (req, res) => {
  reorder(db, 'expenses', req.body.ids, req.user.id);
  res.json({ ok: true });
});

router.post('/', (req, res) => {
  const { name, monthly_amount, group_id, funding_allocations, funding_rules, frequency, start_date, end_date } = req.body;
  if (!name || !isAmount(monthly_amount) || monthly_amount < 0 || !start_date) {
    return res.status(400).json({ error: 'name, a non-negative numeric monthly_amount and start_date are required' });
  }
  const budget = budgetFields(req.body, null);
  const normalizedFrequency = budget.isBudget ? 'monthly' : normalizeFrequency(frequency);
  let normalizedStart;
  let normalizedEnd;
  let cleanedRules;
  try {
    normalizedStart = normalizeDate(start_date, 'start_date', { required: true });
    normalizedEnd = endDateFor(normalizedFrequency, end_date);
    cleanedRules = cleanFundingRules(funding_rules);
  } catch (e) {
    if (dateError(res, e)) return;
    throw e;
  }
  if (rangeError(res, normalizedStart, normalizedEnd)) return;
  const stmt = db.prepare(
    `INSERT INTO expenses (user_id, name, monthly_amount, group_id, funding_allocations, funding_rules, frequency, start_date, end_date, is_budget, budget_categories)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  const result = stmt.run(
    req.user.id, name, monthly_amount, group_id ?? null,
    JSON.stringify(cleanAllocations(funding_allocations)),
    JSON.stringify(cleanedRules),
    normalizedFrequency, normalizedStart, normalizedEnd,
    budget.isBudget, JSON.stringify(budget.categories),
  );
  const row = db.prepare('SELECT * FROM expenses WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(serialize(row, req.user.id));
});

router.put('/:id', (req, res) => {
  const { name, monthly_amount, group_id, funding_allocations, funding_rules, frequency, start_date, end_date } = req.body;
  const { id } = req.params;
  const existing = db.prepare('SELECT * FROM expenses WHERE id = ? AND user_id = ?').get(id, req.user.id);
  if (!existing) return res.status(404).json({ error: 'Not found' });
  const budget = budgetFields(req.body, existing);
  const normalizedFrequency = budget.isBudget
    ? 'monthly'
    : frequency ? normalizeFrequency(frequency, existing.frequency) : existing.frequency;
  let cleanedRules = existing.funding_rules;
  let normalizedStart = existing.start_date;
  let normalizedEnd = existing.end_date;
  try {
    if (start_date !== undefined) normalizedStart = normalizeDate(start_date, 'start_date', { required: true });
    if (end_date !== undefined) normalizedEnd = normalizeDate(end_date, 'end_date');
    if (funding_rules !== undefined) cleanedRules = JSON.stringify(cleanFundingRules(funding_rules));
  } catch (e) {
    if (dateError(res, e)) return;
    throw e;
  }
  // A one-time expense has a single occurrence, so an end date is meaningless.
  if (normalizedFrequency === 'one-time') normalizedEnd = null;
  if (rangeError(res, normalizedStart, normalizedEnd)) return;

  db.prepare(
    `UPDATE expenses
     SET name = ?, monthly_amount = ?, group_id = ?, funding_allocations = ?, funding_rules = ?, frequency = ?, start_date = ?, end_date = ?,
         is_budget = ?, budget_categories = ?, updated_at = datetime('now')
     WHERE id = ? AND user_id = ?`
  ).run(
    name ?? existing.name,
    monthly_amount ?? existing.monthly_amount,
    group_id !== undefined ? (group_id ?? null) : existing.group_id,
    funding_allocations !== undefined ? JSON.stringify(cleanAllocations(funding_allocations)) : existing.funding_allocations,
    cleanedRules,
    normalizedFrequency,
    normalizedStart,
    normalizedEnd,
    budget.isBudget, JSON.stringify(budget.categories),
    id, req.user.id,
  );
  const row = db.prepare('SELECT * FROM expenses WHERE id = ?').get(id);
  res.json(serialize(row, req.user.id));
});

router.delete('/:id', (req, res) => {
  const { id } = req.params;
  const existing = db.prepare('SELECT * FROM expenses WHERE id = ? AND user_id = ?').get(id, req.user.id);
  if (!existing) return res.status(404).json({ error: 'Not found' });
  db.prepare("DELETE FROM paid_status WHERE entity_type = 'expense' AND entity_id = ? AND user_id = ?").run(id, req.user.id);
  db.prepare('DELETE FROM expenses WHERE id = ? AND user_id = ?').run(id, req.user.id);
  res.status(204).end();
});

module.exports = router;
