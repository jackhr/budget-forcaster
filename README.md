# Budget Forecaster

A local-first personal-finance forecaster: project your cash, savings, debts, and net worth month by month. Built with React + Vite (TypeScript) on the front end and Express + SQLite on the back end. Single user, no auth — everything stays on your machine.

## Features

The header holds global controls (total cash, currency, inflation) and a tab bar. On narrow screens the tabs and toolbar collapse into a hamburger menu. Every data section (Accounts, Connect a bank, Income, Expenses, Future Expenses, Debts) can be collapsed, and its state is remembered.

### Tabs

- **Forecast** — actual monthly cash flow: income vs. total spending (ongoing expenses + future expenses + debt payments) and net, with adjustable horizon (slider, 1–60 mo).
- **Savings** — running balance over the horizon, seeded by total cash. A **Today** marker, green **lump-income** bars (quarterly/annual/one-time), and orange **future-expense** bars. Switch between all-accounts and a single account. Summary cards: projected balance, net change, lowest balance (flags going negative).
- **Net Worth** — cash minus remaining debt over time.
- **Breakdown** — per-item line charts for Accounts, Income, Expenses, Future, or Debts. The **Accounts Over Time** view overlays future-expense bars (toggle to include/exclude them in the projection) and shows each future expense's **funding source** in the tooltip.
- **Overview** — combined monthly flows, balances, and future-expense totals in one chart.
- **Account** — per-account activity (what flows in and out of a single account).
- **Transactions** — Rocket-Money-style list of real transactions pulled from linked banks (see Plaid below).

### Money model

- **Accounts** — multiple cash/savings piles. Income lands in a chosen account; the ★ **primary** account pays the bills. Total cash is the sum of accounts.
- **Income sources** — per-payment amount + **frequency** (weekly/bi-weekly/monthly/quarterly/annually/one-time). Monthly and sub-monthly contribute every month; quarterly/annual/one-time arrive as lumps.
- **Expenses** — recurring costs with a frequency and optional date range. Inflation (set in the header) compounds onto ongoing expenses.
- **Future expenses** — known upcoming commitments (one-off or recurring with a start/optional end month).
- **Debts** — credit cards vs. loans. Each has a balance, APR, optional credit limit, monthly payment, an optional **autopay day**, and a type:
  - **Credit cards** are revolving and can be *charged* (used to fund expenses/future expenses); charges are capped at available credit, with any overflow spilling to cash.
  - **Loans** are installment debt and can't be charged.
  - A combined **payoff plan** (avalanche / snowball + a global extra payment with rollover) shows when you'll be debt-free and how much interest/time a strategy saves. Each row shows its own payoff date and total interest.
- **Funding plans** — expenses, future expenses, and debt payments can be paid from accounts and/or credit cards. The editors default to a **simple "pay from" dropdown** (one account, or a card for chargeable items) — no rule needed. A **"Split or schedule…"** option opens the full funding plan for percentage/fixed splits across sources with their own frequency and date range.
- **Grouping** — income, expenses, and debts can be organized into named groups with subtotals, rename, collapse, and non-destructive ungroup.

### Scenarios & data

- Save the current state as a named **scenario**, **compare** it as an overlay on the charts, or **restore** it.
- **Export/Import** the full dataset as JSON.
- Inline validation, two-step delete confirmation, and error toasts. Everything persists to local SQLite and saves automatically.

### Bank linking (Plaid)

Optional — connect real banks via Plaid to import balances and transactions.

- Link **multiple institutions** (including multiple logins at the same bank); each renders as its own collapsible group with its accounts nested underneath.
- **Imports auto-classify** by Plaid account type: depository/investment → cash accounts; credit → credit-card debts (with the reported limit); loan → loan debts.
- Imported accounts are **linked** so they can't be imported twice — instead, **Sync** (per institution) or **Sync all** pulls fresh balances into the existing accounts/debts.
- **Balances are cached** and refreshed in the background at most every 5 minutes; **transactions are cached** in SQLite and kept current with Plaid's cursor-based sync, so pages load instantly and only the first sync (or an explicit refresh) hits Plaid.
- Switch between **sandbox and production** with the `PLAID_ENV` env var (see Setup).

The Forecast and Savings views share the same per-month engine, so the savings balance change each month equals the forecast net for that month.

## Tech Stack

- **Frontend**: React 18, TypeScript, Vite, Recharts (charts are code-split/lazy-loaded), react-plaid-link
- **Backend**: Node.js, Express, better-sqlite3, dotenv, plaid
- **Database**: SQLite (auto-created, seeded, and migrated on first run)
- **Tests**: Vitest (unit tests for the forecast/debt math libs)

## Setup

```bash
# 1. Install frontend deps
npm install

# 2. Install server deps
cd server && npm install && cd ..

# 3. Run both together
npm run dev
```

This starts the **API** on `http://localhost:3001` and the **client** on `http://localhost:5173` (Vite proxies `/api` → `:3001`). Open [http://localhost:5173](http://localhost:5173).

Run them separately if you prefer:

```bash
npm run dev:server   # backend only
npm run dev:client   # frontend only
```

### Other commands

```bash
npm test     # Vitest unit tests for the math libs
npm run build # tsc -b + vite production build (test files excluded)
```

### Plaid (optional)

To enable bank linking, create a `.env` in the repo root (gitignored):

```bash
PLAID_CLIENT_ID=your_client_id
PLAID_SANDBOX_SECRET=your_sandbox_secret
PLAID_PROD_SECRET=your_production_secret   # only needed for production
PLAID_ENV=sandbox                          # or "production"
```

`PLAID_ENV` selects the environment and which secret is used. The server reads `.env` at boot, so **restart it after changing these** (`node --watch` restarts on `server/**` edits but not on `.env`). Without Plaid configured, the rest of the app works normally; the "Connect a bank" panel just shows setup instructions.

## Database

SQLite is created automatically at `server/db/budget.db` on first run, then seeded with example data and migrated idempotently on every boot (the server runs with `node --watch`). The file is gitignored — all data is local.

Tables: `accounts`, `income_sources`, `expenses`, `scheduled_payments` (future expenses), `debts`, `line_item_groups`, `app_settings` (key/value: `starting_balance`, `currency`, `inflation_rate`, `debt_extra`, `debt_strategy`), `scenarios`, and the Plaid cache (`plaid_items`, `plaid_accounts`, `plaid_transactions`). Reorderable/groupable tables carry `sort_order` and `group_id`; debts/accounts carry a `plaid_account_id` link when imported. Schema changes are applied as idempotent `CREATE TABLE IF NOT EXISTS` + `PRAGMA table_info` guarded `ALTER`s.

Endpoints (under `/api`): CRUD for `income`, `expenses`, `scheduled`, `debts`, `accounts`, `groups` (each with a `/reorder`); `scenarios` (+ restore); `export` / `import`; `settings` (`GET` all, `PUT /:key`); and `plaid/*` (status, link token, exchange, accounts, transactions, import, resync, unlink).

## Project Structure

```
/
├── src/                      # React frontend
│   ├── api/client.ts         # Typed API helpers
│   ├── components/           # UI (charts lazy-loaded; Modal, Toolbar, Debts, PlaidConnect, …)
│   ├── lib/                  # forecast.ts, debt.ts, format.ts, useDnd.ts,
│   │                         # useCollapsed.ts, useCollapsedGroup.ts, useMediaQuery.ts
│   ├── types/index.ts        # Shared TypeScript types
│   ├── App.tsx               # Single source of truth: state, derived series, handlers
│   └── main.tsx
├── server/
│   ├── db/database.js        # Connection + schema + seed + migrations
│   ├── lib/                  # data.js (export/import/reorder), funding.js, dates.js, plaid.js
│   ├── routes/               # income, expenses, scheduled, debts, accounts, groups,
│   │                         # scenarios, plaid, + export/import
│   ├── server.js             # Mounts routers, loads .env, CORS to the Vite origin
│   └── package.json
├── package.json
└── vite.config.ts
```

See `CLAUDE.md` for deeper architecture notes (the shared per-month engine, the debt simulation, the funding model, and the migration conventions).
