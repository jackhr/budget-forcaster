const Database = require('better-sqlite3');
const path = require('path');

// BF_DB_PATH lets tests point at a scratch database instead of the real one.
const DB_PATH = process.env.BF_DB_PATH || path.join(__dirname, 'budget.db');
const db = new Database(DB_PATH);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// --- Identity ---
// Every row of household data belongs to a user; see the user_id migration below.
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL,
    email_normalized TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    name TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    expires_at TEXT NOT NULL,
    user_agent TEXT,
    ip TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
`);

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

  -- A destination: an amount to reach, or a debt to clear, optionally by a date.
  -- Goals are a feature, not a requirement — the rest of the app works with none.
  CREATE TABLE IF NOT EXISTS goals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    kind TEXT NOT NULL,            -- 'savings' | 'debt_payoff' | 'net_worth'
    target_amount REAL,            -- null for debt_payoff, where the target is zero
    start_amount REAL,             -- the value when the goal was set, so progress has a baseline
    target_date TEXT,              -- YYYY-MM-DD; null = no deadline
    account_id INTEGER REFERENCES accounts(id) ON DELETE SET NULL,  -- savings: null = all cash
    debt_id INTEGER REFERENCES debts(id) ON DELETE CASCADE,         -- debt_payoff: null = every debt
    note TEXT,
    sort_order INTEGER,
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

  CREATE TABLE IF NOT EXISTS plaid_transactions (
    transaction_id TEXT PRIMARY KEY,
    item_id TEXT NOT NULL,
    account_id TEXT NOT NULL,
    date TEXT NOT NULL,
    name TEXT,
    amount REAL,
    currency TEXT,
    pending INTEGER NOT NULL DEFAULT 0,
    category TEXT,
    logo_url TEXT,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_plaid_txn_account_date ON plaid_transactions (account_id, date);

  CREATE TABLE IF NOT EXISTS plaid_accounts (
    account_id TEXT PRIMARY KEY,
    item_id TEXT NOT NULL,
    institution_name TEXT,
    name TEXT,
    official_name TEXT,
    mask TEXT,
    type TEXT,
    subtype TEXT,
    current REAL,
    available REAL,
    credit_limit REAL,
    currency TEXT,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

// --- Migration: cursor + sync timestamps on plaid_items ---
const plaidItemCols = db.prepare('PRAGMA table_info(plaid_items)').all();
if (!plaidItemCols.some((c) => c.name === 'cursor')) {
  db.exec('ALTER TABLE plaid_items ADD COLUMN cursor TEXT');
}
if (!plaidItemCols.some((c) => c.name === 'transactions_synced_at')) {
  db.exec('ALTER TABLE plaid_items ADD COLUMN transactions_synced_at TEXT');
}
if (!plaidItemCols.some((c) => c.name === 'accounts_synced_at')) {
  db.exec('ALTER TABLE plaid_items ADD COLUMN accounts_synced_at TEXT');
}
if (!plaidItemCols.some((c) => c.name === 'liabilities_synced_at')) {
  db.exec('ALTER TABLE plaid_items ADD COLUMN liabilities_synced_at TEXT');
}
if (!plaidItemCols.some((c) => c.name === 'liabilities_consent_required')) {
  db.exec('ALTER TABLE plaid_items ADD COLUMN liabilities_consent_required INTEGER NOT NULL DEFAULT 0');
}
// Plaid ITEM_ERROR code (e.g. ITEM_LOGIN_REQUIRED) from the last failed call; null = healthy.
if (!plaidItemCols.some((c) => c.name === 'error_code')) {
  db.exec('ALTER TABLE plaid_items ADD COLUMN error_code TEXT');
}

// Plaid's detailed personal_finance_category (e.g. FOOD_AND_DRINK_GROCERIES vs _RESTAURANT).
const plaidTxnCols = db.prepare('PRAGMA table_info(plaid_transactions)').all();
if (!plaidTxnCols.some((c) => c.name === 'category_detailed')) {
  db.exec('ALTER TABLE plaid_transactions ADD COLUMN category_detailed TEXT');
}

// --- Migration: link imported rows back to their Plaid account (block re-import, enable resync) ---
for (const table of ['accounts', 'debts']) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all();
  if (!cols.some((c) => c.name === 'plaid_account_id')) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN plaid_account_id TEXT`);
  }
}

// --- Migration: goals gained a progress baseline after the table first shipped ---
if (!db.prepare('PRAGMA table_info(goals)').all().some((c) => c.name === 'start_amount')) {
  db.exec('ALTER TABLE goals ADD COLUMN start_amount REAL');
}

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
for (const [column, definition] of [
  ['last_statement_balance', 'REAL'],
  ['last_statement_issue_date', 'TEXT'],
  ['next_payment_due_date', 'TEXT'],
  ['last_payment_amount', 'REAL'],
  ['last_payment_date', 'TEXT'],
  ['is_overdue', 'INTEGER'],
  ['plaid_aprs', "TEXT NOT NULL DEFAULT '[]'"],
]) {
  if (!debtColsForGroup.some((c) => c.name === column)) {
    db.exec(`ALTER TABLE debts ADD COLUMN ${column} ${definition}`);
  }
}

// Cached Plaid Liabilities fields, joined to imported debts by plaid_account_id.
const plaidAccountCols = db.prepare('PRAGMA table_info(plaid_accounts)').all();
for (const [column, definition] of [
  ['apr', 'REAL'],
  ['minimum_payment_amount', 'REAL'],
  ['last_statement_balance', 'REAL'],
  ['last_statement_issue_date', 'TEXT'],
  ['next_payment_due_date', 'TEXT'],
  ['last_payment_amount', 'REAL'],
  ['last_payment_date', 'TEXT'],
  ['is_overdue', 'INTEGER'],
  ['aprs', "TEXT NOT NULL DEFAULT '[]'"],
]) {
  if (!plaidAccountCols.some((c) => c.name === column)) {
    db.exec(`ALTER TABLE plaid_accounts ADD COLUMN ${column} ${definition}`);
  }
}
// Split funding for expenses (JSON array of allocations).
const expenseFundingCols = db.prepare('PRAGMA table_info(expenses)').all();
if (!expenseFundingCols.some((c) => c.name === 'funding_allocations')) {
  db.exec("ALTER TABLE expenses ADD COLUMN funding_allocations TEXT NOT NULL DEFAULT '[]'");
}
if (!expenseFundingCols.some((c) => c.name === 'funding_rules')) {
  db.exec("ALTER TABLE expenses ADD COLUMN funding_rules TEXT NOT NULL DEFAULT '[]'");
}
// Expenses get a frequency, a first-occurrence date, and an optional end date.
if (!expenseFundingCols.some((c) => c.name === 'frequency')) {
  db.exec("ALTER TABLE expenses ADD COLUMN frequency TEXT NOT NULL DEFAULT 'monthly'");
}
if (!expenseFundingCols.some((c) => c.name === 'start_date')) {
  db.exec('ALTER TABLE expenses ADD COLUMN start_date TEXT');
}
if (!expenseFundingCols.some((c) => c.name === 'end_date')) {
  db.exec('ALTER TABLE expenses ADD COLUMN end_date TEXT'); // null = ongoing
}
// Existing expenses predate the required first-occurrence date; keep them active from today.
db.exec("UPDATE expenses SET start_date = date('now') WHERE start_date IS NULL");

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
if (!incomeCols.some((c) => c.name === 'payday_1')) {
  db.exec('ALTER TABLE income_sources ADD COLUMN payday_1 INTEGER');
}
if (!incomeCols.some((c) => c.name === 'payday_2')) {
  db.exec('ALTER TABLE income_sources ADD COLUMN payday_2 INTEGER');
}
db.exec(`
  CREATE TABLE IF NOT EXISTS income_occurrences (
    income_id INTEGER NOT NULL,
    scheduled_date TEXT NOT NULL,
    occurrence_date TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'expected',
    transaction_id TEXT,
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (income_id, scheduled_date),
    FOREIGN KEY (income_id) REFERENCES income_sources(id) ON DELETE CASCADE
  )
`);

// "Paid this month" overrides for debts and expenses, one row per entity per month.
// Absent row = default (debt: Plaid detection, then autopay day; expense: unpaid).
db.exec(`
  CREATE TABLE IF NOT EXISTS paid_status (
    entity_type TEXT NOT NULL,
    entity_id INTEGER NOT NULL,
    month TEXT NOT NULL,
    paid INTEGER NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (entity_type, entity_id, month)
  )
`);

// --- Migration: scope every row to a user ---
// Added nullable so an existing single-user database keeps working; the first
// account registered adopts every unowned row (see claimUnownedData).
const OWNED_TABLES = [
  'accounts', 'income_sources', 'expenses', 'debts', 'line_item_groups', 'goals',
  'scenarios', 'income_occurrences', 'plaid_items', 'plaid_accounts', 'plaid_transactions',
];
for (const table of OWNED_TABLES) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all();
  if (!cols.some((c) => c.name === 'user_id')) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN user_id INTEGER REFERENCES users(id) ON DELETE CASCADE`);
  }
  db.exec(`CREATE INDEX IF NOT EXISTS idx_${table}_user ON ${table}(user_id)`);
}

// app_settings and paid_status are keyed by something that is only unique per
// user, so they need a rebuilt primary key rather than an added column.
function rebuildWithUserKey(table, createSql, columns) {
  if (db.prepare(`PRAGMA table_info(${table})`).all().some((c) => c.name === 'user_id')) return;
  const rows = db.prepare(`SELECT * FROM ${table}`).all();
  const tx = db.transaction(() => {
    db.exec(`ALTER TABLE ${table} RENAME TO ${table}_legacy`);
    db.exec(createSql);
    if (rows.length) {
      const insert = db.prepare(
        `INSERT INTO ${table} (user_id, ${columns.join(', ')}) VALUES (NULL, ${columns.map(() => '?').join(', ')})`
      );
      for (const row of rows) insert.run(...columns.map((c) => row[c]));
    }
    db.exec(`DROP TABLE ${table}_legacy`);
  });
  tx();
}

rebuildWithUserKey('app_settings', `
  CREATE TABLE app_settings (
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    key TEXT NOT NULL,
    value TEXT NOT NULL,
    PRIMARY KEY (user_id, key)
  )
`, ['key', 'value']);

rebuildWithUserKey('paid_status', `
  CREATE TABLE paid_status (
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    entity_type TEXT NOT NULL,
    entity_id INTEGER NOT NULL,
    month TEXT NOT NULL,
    paid INTEGER NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (user_id, entity_type, entity_id, month)
  )
`, ['entity_type', 'entity_id', 'month', 'paid', 'updated_at']);

const USER_SCOPED_TABLES = [...OWNED_TABLES, 'app_settings', 'paid_status'];

// The first account registered on a database that predates auth inherits the
// household data already in it. Later registrations always start empty.
function claimUnownedData(userId) {
  const tx = db.transaction(() => {
    for (const table of USER_SCOPED_TABLES) {
      db.prepare(`UPDATE ${table} SET user_id = ? WHERE user_id IS NULL`).run(userId);
    }
  });
  tx();
}

function hasUnownedData() {
  return USER_SCOPED_TABLES.some((table) =>
    !!db.prepare(`SELECT 1 FROM ${table} WHERE user_id IS NULL LIMIT 1`).get());
}

// --- Migration: drop the retired "Future Expenses" table ---
db.exec('DROP TABLE IF EXISTS scheduled_payments');

// --- Seed example data on first run ---
// Skipped under test so an isolation run starts from a genuinely empty database.
const SEED = process.env.NODE_ENV !== 'test';

const incomeCount = db.prepare('SELECT COUNT(*) as count FROM income_sources').get();
if (SEED && incomeCount.count === 0) {
  const insertIncome = db.prepare(
    'INSERT INTO income_sources (name, monthly_amount, growth_rate_annual, frequency) VALUES (?, ?, ?, ?)'
  );
  insertIncome.run('Primary Salary', 5000, 3, 'monthly');
  insertIncome.run('Freelance Work', 800, 5, 'monthly');
  insertIncome.run('Investment Dividends', 200, 7, 'quarterly');
  insertIncome.run('Annual Bonus', 6000, 4, 'annually');
}

const expenseCount = db.prepare('SELECT COUNT(*) as count FROM expenses').get();
if (SEED && expenseCount.count === 0) {
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

const startingBalance = db.prepare("SELECT value FROM app_settings WHERE key = 'starting_balance'").get();
if (SEED && !startingBalance) {
  db.prepare('INSERT INTO app_settings (key, value) VALUES (?, ?)').run('starting_balance', '10000');
}

// Seed accounts on first run, migrating the legacy single starting_balance into a primary "Cash" account.
const accountCount = db.prepare('SELECT COUNT(*) as count FROM accounts').get();
if (SEED && accountCount.count === 0) {
  const sb = db.prepare("SELECT value FROM app_settings WHERE key = 'starting_balance'").get();
  const bal = sb ? (parseFloat(sb.value) || 0) : 0;
  db.prepare('INSERT INTO accounts (name, balance, is_primary, sort_order) VALUES (?, ?, 1, 0)').run('Cash', bal);
}

const debtCount = db.prepare('SELECT COUNT(*) as count FROM debts').get();
if (SEED && debtCount.count === 0) {
  const insertDebt = db.prepare(
    'INSERT INTO debts (name, balance, apr, credit_limit, monthly_payment) VALUES (?, ?, ?, ?, ?)'
  );
  insertDebt.run('Amex', 4200, 19.9, 6000, 300);
  insertDebt.run('Car Loan', 18000, 6.5, null, 420);
}

module.exports = db;
module.exports.claimUnownedData = claimUnownedData;
module.exports.hasUnownedData = hasUnownedData;
module.exports.USER_SCOPED_TABLES = USER_SCOPED_TABLES;
