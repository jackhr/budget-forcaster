// Budgets: an expense with a spending limit, tracked against Plaid categories.
//
// A budget is still an expense (one cost entity — see business-logic/10), so
// the forecast bills it like any other. What makes it a budget is that this
// month's actual spending in its categories is already in today's balances, so
// month 0 only bills what's left of it. That arithmetic lives client-side in
// forecast.ts; this module supplies the "spent so far" number.

// Categories that aren't spending: income, money moving between your own
// accounts, and loan payments (modelled as debts). Offering them as budget
// categories would double-count or invert the sign.
const NON_SPENDING = new Set([
  'INCOME', 'TRANSFER_IN', 'TRANSFER_OUT', 'LOAN_PAYMENTS', 'LOAN_DISBURSEMENTS',
]);

const CATEGORY_RE = /^[A-Z][A-Z0-9_]{1,79}$/;

/** A clean, de-duplicated list of Plaid category codes (primary or detailed). */
function cleanCategories(input) {
  if (!Array.isArray(input)) return [];
  const out = [];
  for (const raw of input) {
    const value = String(raw ?? '').trim().toUpperCase();
    if (CATEGORY_RE.test(value) && !NON_SPENDING.has(value) && !out.includes(value)) out.push(value);
    if (out.length >= 20) break;
  }
  return out;
}

function parseCategories(text) {
  try {
    const parsed = JSON.parse(text || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function ymd(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** [first day, first day of the next month) for the month `offset` away from `now`. */
function monthBounds(now = new Date(), offset = 0) {
  const start = new Date(now.getFullYear(), now.getMonth() + offset, 1);
  const end = new Date(now.getFullYear(), now.getMonth() + offset + 1, 1);
  return [ymd(start), ymd(end)];
}

/**
 * Posted spending in any of `categories` between two dates. Plaid amounts are
 * positive for money out, so refunds net off. Pending transactions are left
 * out: they aren't in the posted balance the forecast starts from either.
 */
function spentIn(db, userId, categories, [start, end]) {
  if (!categories.length) return 0;
  const marks = categories.map(() => '?').join(', ');
  const row = db.prepare(
    `SELECT COALESCE(SUM(amount), 0) AS total FROM plaid_transactions
     WHERE user_id = ? AND pending = 0 AND date >= ? AND date < ?
       AND (category IN (${marks}) OR category_detailed IN (${marks}))`
  ).get(userId, start, end, ...categories, ...categories);
  return Math.max(0, Math.round((row?.total ?? 0) * 100) / 100);
}

/**
 * Every spending category this user's transactions use, with what was spent
 * this month and the average of the three full months before it — enough to
 * pick categories and set a realistic amount.
 */
function categorySummary(db, userId, now = new Date()) {
  const rows = db.prepare(
    `SELECT DISTINCT category FROM plaid_transactions
     WHERE user_id = ? AND category IS NOT NULL AND category != ''`
  ).all(userId);
  const thisMonth = monthBounds(now, 0);
  const prior = [monthBounds(now, -3)[0], thisMonth[0]];
  return rows
    .map((r) => r.category)
    .filter((c) => CATEGORY_RE.test(c) && !NON_SPENDING.has(c))
    .map((category) => ({
      category,
      this_month: spentIn(db, userId, [category], thisMonth),
      monthly_average: Math.round((spentIn(db, userId, [category], prior) / 3) * 100) / 100,
    }))
    .sort((a, b) => b.monthly_average - a.monthly_average || a.category.localeCompare(b.category));
}

module.exports = { cleanCategories, parseCategories, monthBounds, spentIn, categorySummary, NON_SPENDING };
