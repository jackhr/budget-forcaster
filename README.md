# Budget Forecaster

A local-first full-stack budget forecasting app built with React + Vite (TypeScript) and Express + SQLite.

## Features

Two views, toggled from the header:

**Global**
- **Current Cash** is editable in the header and visible on every view (seeds the savings balance)
- **Currency selector** in the header (USD/EUR/GBP/CAD/AUD/JPY), persisted; all amounts format through one config point
- Line items can be organized into **groups** (e.g. "Jack CC payments") with per-group subtotals, rename, collapse, and non-destructive ungroup
- Inline validation, two-step delete confirmation, and error toasts on save failures

**Forecast**
- Add/edit/delete income sources and expense categories
- Income sources support a **frequency** (weekly, bi-weekly, monthly, quarterly, annually, one-time)
- Adjustable forecast period (1–60 months) via slider
- Chart shows **actual monthly cash flow** — income, total spending (ongoing expenses *plus* future expenses as they land), and net
- Summary cards: current monthly net, projected net at end of period

**Savings**
- **Accumulated balance chart** — a running savings balance over the horizon, seeded by Current Cash
- A **Today** marker, green **lump-income** bars (quarterly/annual/one-time inflows), and red **future-expense** bars labeled with their name
- **Future expenses** — known upcoming commitments that draw down the balance. Each can be **one-off** (e.g. a vacation) or **recurring** (e.g. a monthly credit-card or mortgage payment) with a start month and an optional end month
- Income lands as real cash events: monthly/sub-monthly contribute every month, quarterly/annual arrive as lump sums, one-time hits once
- Summary cards: projected balance, net change, and lowest balance (flags if savings ever go negative)

The Forecast and Savings views share the same math, so the savings balance change each month equals the forecast net for that month.

All data persists to a local SQLite database and saves automatically.

## Tech Stack

- **Frontend**: React 18, TypeScript, Vite, Recharts
- **Backend**: Node.js, Express, better-sqlite3
- **Database**: SQLite (auto-created on first run with example data)

## Setup

### 1. Install root (frontend) dependencies

```bash
npm install
```

### 2. Install server dependencies

```bash
cd server && npm install && cd ..
```

### 3. Run the app

From the root directory, run both frontend and backend together:

```bash
npm run dev
```

This starts:
- **API server** on `http://localhost:3001`
- **React app** on `http://localhost:5173`

Open [http://localhost:5173](http://localhost:5173) in your browser.

### Or run separately

```bash
# Terminal 1 — backend
npm run dev:server

# Terminal 2 — frontend
npm run dev:client
```

## Database

The SQLite database is created automatically at `server/db/budget.db` on first run. Example data is seeded (income sources incl. quarterly/annual, expenses, scheduled payments, and a starting balance). The file is excluded from git — all data is local to your machine.

Tables: `income_sources` (with `frequency`), `expenses`, `scheduled_payments` (`frequency`, `start_date`, `end_date`), and `app_settings` (key/value, holds `starting_balance`). On upgrade, a `frequency` column is added to existing `income_sources` rows (defaults to `monthly`), and `scheduled_payments` is migrated from the old one-off `due_date` shape to `frequency`/`start_date`/`end_date` automatically.

Endpoints: full CRUD under `/api/income`, `/api/expenses`, `/api/scheduled`; plus `GET /api/settings` and `PUT /api/settings/:key`.

## Project Structure

```
/
├── src/                    # React frontend
│   ├── api/client.ts       # Typed API helpers
│   ├── components/         # UI components
│   ├── types/index.ts      # Shared TypeScript types
│   ├── App.tsx
│   └── main.tsx
├── server/
│   ├── db/
│   │   ├── database.js     # DB connection + schema + seed
│   │   └── budget.db       # Created on first run (gitignored)
│   ├── routes/
│   │   ├── income.js
│   │   └── expenses.js
│   ├── server.js
│   └── package.json
├── package.json
└── vite.config.ts
```
