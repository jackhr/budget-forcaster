const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, 'budget.db');
const db = new Database(DB_PATH);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS income_sources (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    monthly_amount REAL NOT NULL,
    growth_rate_annual REAL NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS expenses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    monthly_amount REAL NOT NULL,
    growth_rate_annual REAL NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS scheduled_payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    amount REAL NOT NULL,
    frequency TEXT NOT NULL DEFAULT 'one-time',
    start_date TEXT NOT NULL,
    end_date TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS app_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS line_item_groups (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    kind TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS debts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    balance REAL NOT NULL,
    apr REAL NOT NULL DEFAULT 0,
    credit_limit REAL,
    monthly_payment REAL NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS scenarios (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    snapshot TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS accounts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    balance REAL NOT NULL DEFAULT 0,
    is_primary INTEGER NOT NULL DEFAULT 0,
    sort_order INTEGER,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS plaid_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    item_id TEXT NOT NULL UNIQUE,
    access_token TEXT NOT NULL,
    institution_name TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

// --- Migration: add sort_order to reorderable tables ---
for (const table of ['income_sources', 'expenses', 'debts', 'line_item_groups']) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all();
  if (!cols.some((c) => c.name === 'sort_order')) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN sort_order INTEGER`);
  }
}

// --- Migration: add group_id to income_sources and expenses if missing ---
const incomeColsForGroup = db.prepare('PRAGMA table_info(income_sources)').all();
if (!incomeColsForGroup.some((c) => c.name === 'group_id')) {
  db.exec('ALTER TABLE income_sources ADD COLUMN group_id INTEGER');
}
const expenseColsForGroup = db.prepare('PRAGMA table_info(expenses)').all();
if (!expenseColsForGroup.some((c) => c.name === 'group_id')) {
  db.exec('ALTER TABLE expenses ADD COLUMN group_id INTEGER');
}
const debtColsForGroup = db.prepare('PRAGMA table_info(debts)').all();
if (!debtColsForGroup.some((c) => c.name === 'group_id')) {
  db.exec('ALTER TABLE debts ADD COLUMN group_id INTEGER');
}
if (!debtColsForGroup.some((c) => c.name === 'account_id')) {
  db.exec('ALTER TABLE debts ADD COLUMN account_id INTEGER'); // account that pays this debt; null = primary
}
if (!debtColsForGroup.some((c) => c.name === 'funding_allocations')) {
  db.exec("ALTER TABLE debts ADD COLUMN funding_allocations TEXT NOT NULL DEFAULT '[]'");
}
if (!debtColsForGroup.some((c) => c.name === 'funding_rules')) {
  db.exec("ALTER TABLE debts ADD COLUMN funding_rules TEXT NOT NULL DEFAULT '[]'");
}
// Debt type: credit cards (revolving, chargeable) vs loans (installment, not chargeable).
if (!debtColsForGroup.some((c) => c.name === 'debt_type')) {
  db.exec("ALTER TABLE debts ADD COLUMN debt_type TEXT NOT NULL DEFAULT 'credit_card'");
  // Infer existing rows: a credit limit implies revolving credit; otherwise it's a loan.
  db.exec("UPDATE debts SET debt_type = 'loan' WHERE credit_limit IS NULL");
}
// Optional autopay day-of-month (1-31) for the debt's payment.
if (!debtColsForGroup.some((c) => c.name === 'payment_day')) {
  db.exec('ALTER TABLE debts ADD COLUMN payment_day INTEGER');
}
// Split funding for expenses (JSON array of allocations).
const expenseFundingCols = db.prepare('PRAGMA table_info(expenses)').all();
if (!expenseFundingCols.some((c) => c.name === 'funding_allocations')) {
  db.exec("ALTER TABLE expenses ADD COLUMN funding_allocations TEXT NOT NULL DEFAULT '[]'");
}
if (!expenseFundingCols.some((c) => c.name === 'funding_rules')) {
  db.exec("ALTER TABLE expenses ADD COLUMN funding_rules TEXT NOT NULL DEFAULT '[]'");
}
// Expenses get a frequency + date range (like income / future expenses).
if (!expenseFundingCols.some((c) => c.name === 'frequency')) {
  db.exec("ALTER TABLE expenses ADD COLUMN frequency TEXT NOT NULL DEFAULT 'monthly'");
}
if (!expenseFundingCols.some((c) => c.name === 'start_date')) {
  db.exec('ALTER TABLE expenses ADD COLUMN start_date TEXT'); // null = now / always
}
if (!expenseFundingCols.some((c) => c.name === 'end_date')) {
  db.exec('ALTER TABLE expenses ADD COLUMN end_date TEXT'); // null = ongoing
}

// --- Migration: add frequency column to income_sources if it doesn't exist ---
const incomeCols = db.prepare('PRAGMA table_info(income_sources)').all();
if (!incomeCols.some((c) => c.name === 'frequency')) {
  db.exec("ALTER TABLE income_sources ADD COLUMN frequency TEXT NOT NULL DEFAULT 'monthly'");
}
if (!incomeCols.some((c) => c.name === 'start_date')) {
  db.exec('ALTER TABLE income_sources ADD COLUMN start_date TEXT'); // null = starts now / always
}
if (!incomeCols.some((c) => c.name === 'account_id')) {
  db.exec('ALTER TABLE income_sources ADD COLUMN account_id INTEGER'); // null = primary account
}

// --- Migration: scheduled_payments from one-off (due_date) to recurring (frequency/start_date/end_date) ---
const schedCols = db.prepare('PRAGMA table_info(scheduled_payments)').all();
const hasStartDate = schedCols.some((c) => c.name === 'start_date');
if (!hasStartDate) {
  if (!schedCols.some((c) => c.name === 'frequency')) {
    db.exec("ALTER TABLE scheduled_payments ADD COLUMN frequency TEXT NOT NULL DEFAULT 'one-time'");
  }
  db.exec('ALTER TABLE scheduled_payments ADD COLUMN start_date TEXT');
  db.exec('ALTER TABLE scheduled_payments ADD COLUMN end_date TEXT');
  if (schedCols.some((c) => c.name === 'due_date')) {
    db.exec('UPDATE scheduled_payments SET start_date = due_date WHERE start_date IS NULL');
    db.exec('ALTER TABLE scheduled_payments DROP COLUMN due_date');
  }
}

// --- Migration: funding source (what a future expense is paid from) ---
const schedFundingCols = db.prepare('PRAGMA table_info(scheduled_payments)').all();
if (!schedFundingCols.some((c) => c.name === 'funding_source_type')) {
  db.exec("ALTER TABLE scheduled_payments ADD COLUMN funding_source_type TEXT NOT NULL DEFAULT 'cash'");
  db.exec('ALTER TABLE scheduled_payments ADD COLUMN funding_source_id INTEGER');
}
if (!schedFundingCols.some((c) => c.name === 'funding_allocations')) {
  db.exec("ALTER TABLE scheduled_payments ADD COLUMN funding_allocations TEXT NOT NULL DEFAULT '[]'");
}
if (!schedFundingCols.some((c) => c.name === 'funding_rules')) {
  db.exec("ALTER TABLE scheduled_payments ADD COLUMN funding_rules TEXT NOT NULL DEFAULT '[]'");
}

// --- Seed example data on first run ---
function relativeMonth(offset) {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() + offset);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}-01`;
}

const incomeCount = db.prepare('SELECT COUNT(*) as count FROM income_sources').get();
if (incomeCount.count === 0) {
  const insertIncome = db.prepare(
    'INSERT INTO income_sources (name, monthly_amount, growth_rate_annual, frequency) VALUES (?, ?, ?, ?)'
  );
  insertIncome.run('Primary Salary', 5000, 3, 'monthly');
  insertIncome.run('Freelance Work', 800, 5, 'monthly');
  insertIncome.run('Investment Dividends', 200, 7, 'quarterly');
  insertIncome.run('Annual Bonus', 6000, 4, 'annually');
}

const expenseCount = db.prepare('SELECT COUNT(*) as count FROM expenses').get();
if (expenseCount.count === 0) {
  const insertExpense = db.prepare(
    'INSERT INTO expenses (name, monthly_amount, growth_rate_annual) VALUES (?, ?, ?)'
  );
  insertExpense.run('Rent / Mortgage', 1800, 2);
  insertExpense.run('Groceries', 400, 3);
  insertExpense.run('Utilities', 150, 2);
  insertExpense.run('Transportation', 300, 1);
  insertExpense.run('Subscriptions', 100, 5);
  insertExpense.run('Dining Out', 250, 4);

  // Demo group with a couple of grouped items
  const groupResult = db.prepare("INSERT INTO line_item_groups (name, kind) VALUES (?, 'expense')").run('Credit Cards');
  const groupId = groupResult.lastInsertRowid;
  const insertGrouped = db.prepare(
    'INSERT INTO expenses (name, monthly_amount, group_id) VALUES (?, ?, ?)'
  );
  insertGrouped.run('Amex', 450, groupId);
  insertGrouped.run('Visa', 300, groupId);
}

const scheduledCount = db.prepare('SELECT COUNT(*) as count FROM scheduled_payments').get();
if (scheduledCount.count === 0) {
  const insertScheduled = db.prepare(
    'INSERT INTO scheduled_payments (name, amount, frequency, start_date, end_date) VALUES (?, ?, ?, ?, ?)'
  );
  // One-off future expenses
  insertScheduled.run('Summer Vacation', 4000, 'one-time', relativeMonth(6), null);
  insertScheduled.run('New Car Down Payment', 8000, 'one-time', relativeMonth(18), null);
  // Recurring known commitments
  insertScheduled.run('Credit Card Payment', 350, 'monthly', relativeMonth(0), relativeMonth(24));
  insertScheduled.run('Car Loan', 420, 'monthly', relativeMonth(1), relativeMonth(48));
  insertScheduled.run('Insurance Premium', 600, 'annually', relativeMonth(3), null);
}

const startingBalance = db.prepare("SELECT value FROM app_settings WHERE key = 'starting_balance'").get();
if (!startingBalance) {
  db.prepare('INSERT INTO app_settings (key, value) VALUES (?, ?)').run('starting_balance', '10000');
}

// Seed accounts on first run, migrating the legacy single starting_balance into a primary "Cash" account.
const accountCount = db.prepare('SELECT COUNT(*) as count FROM accounts').get();
if (accountCount.count === 0) {
  const sb = db.prepare("SELECT value FROM app_settings WHERE key = 'starting_balance'").get();
  const bal = sb ? (parseFloat(sb.value) || 0) : 0;
  db.prepare('INSERT INTO accounts (name, balance, is_primary, sort_order) VALUES (?, ?, 1, 0)').run('Cash', bal);
}

const debtCount = db.prepare('SELECT COUNT(*) as count FROM debts').get();
if (debtCount.count === 0) {
  const insertDebt = db.prepare(
    'INSERT INTO debts (name, balance, apr, credit_limit, monthly_payment) VALUES (?, ?, ?, ?, ?)'
  );
  insertDebt.run('Amex', 4200, 19.9, 6000, 300);
  insertDebt.run('Car Loan', 18000, 6.5, null, 420);
}

module.exports = db;
