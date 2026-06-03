# Budget Forecaster — architecture notes

Local-first personal finance forecaster. React + TypeScript (Vite) front end, Express + better-sqlite3 back end. Single user, no auth — everything is local.

## Run / test

```bash
npm install && cd server && npm install && cd ..
npm run dev      # API on :3001, client on :5173 (Vite proxies /api -> :3001)
npm test         # Vitest unit tests for the math libs
npm run build    # tsc -b + vite build (test files excluded from the build)
```

The SQLite DB lives at `server/db/budget.db` (gitignored) and is created + seeded + migrated on first server boot. The server runs with `node --watch`, so editing `server/**` triggers a restart and re-runs migrations.

## Data model (SQLite, all in `server/db/database.js`)

- `income_sources` — name, monthly_amount (per-payment), `frequency`, `group_id`, `sort_order`
- `expenses` — recurring monthly costs; name, monthly_amount, `group_id`, `sort_order`
- `scheduled_payments` ("Future Expenses") — name, amount, `frequency`, `start_date`, `end_date` (nullable)
- `debts` — name, balance, apr, credit_limit (nullable), monthly_payment, `group_id`, `sort_order`
- `line_item_groups` — name, `kind` ('income' | 'expense' | 'debt'), `sort_order`. Items reference a group via `group_id`; deleting a group **ungroups** its items (sets group_id NULL), never deletes them.
- `app_settings` — key/value. Keys: `starting_balance`, `currency`, `inflation_rate`, `debt_extra`, `debt_strategy`.
- `scenarios` — name + full JSON `snapshot` of all data.

Schema/migrations are idempotent: tables use `CREATE TABLE IF NOT EXISTS`, and columns are added via `PRAGMA table_info` guards (`frequency`, `group_id`, `sort_order`, the scheduled_payments due_date→start_date rewrite). A legacy `growth_rate_annual` column exists but is unused.

## Back end (`server/`)

- `server.js` mounts one router per resource under `/api/*`, plus `/api/scenarios` and `/api` (export/import). CORS is locked to the Vite dev origin; JSON body limit 10mb.
- `routes/*.js` — CRUD per resource. Each list route orders by `lib/data.ORDER_BY` (sort_order, then id) and exposes `POST /<resource>/reorder` (body `{ids:[...]}`) which sets sort_order by index. Numeric inputs are validated (`isAmount`).
- `lib/data.js` — `exportData`/`importData` (full snapshot, used by export/import **and** scenarios), `reorder`, `ORDER_BY`.

## Front end (`src/`)

- `App.tsx` — single source of truth. Loads everything in one `Promise.all`, holds all state, wraps every mutation in `guard()` (errors → toast). Computes all derived series each render and passes them down. Tabs: Forecast / Savings / Net Worth (persisted to localStorage along with the horizon).
- `lib/forecast.ts` — pure math. `cashflowAtMonth` is the shared per-month engine so **Forecast net === Savings month-over-month delta**. `buildForecast`, `buildSavings`, `buildNetWorth`. Inflation compounds onto ongoing expenses. Income frequency: weekly/biweekly/monthly contribute every month; quarterly/annual/one-time arrive as lumps.
- `lib/debt.ts` — `simulateDebt` (independent per-debt amortization, used for row summaries) and `simulateDebtPlan` (combined avalanche/snowball with a global extra payment + rollover; returns per-month `outflow`, `remaining`, and `payoffMonthByDebt`). The plan's `outflow` feeds the forecast/savings math; `remaining` feeds net worth. **Guard:** if a payment ≤ first-month interest, the debt "never pays off" (don't loop forever).
- `lib/format.ts` — the single money-formatting config point (currency is module state, synced from settings; zero-decimal currencies handled).
- `lib/useDnd.ts` — minimal native drag-and-drop reorder hook; `sameBucket` keeps drops within a group. Used by line-item tables and debts (rows + group headers).
- `components/` — charts are `React.lazy` (Recharts is the bulk of the bundle). `Modal` traps focus + restores it. `ConfirmButton` is the two-step delete used everywhere. `Toolbar` handles scenarios + JSON export/import. `LineItemTable`/`Debts` render grouped sections (subtotal, collapse, rename, ungroup) and reuse `AddItemForm`/editors.

## Conventions / gotchas

- Money flows one way: components call `App` handlers → API → update local state. No refetch except after import/scenario-restore (`load()`).
- Grouping is generic across income/expense/debt via `line_item_groups.kind`; each table filters `groups` by its own kind.
- When adding a reorderable/groupable field, remember: migration in `database.js`, ordering in the route, the `group_id`/`sort_order` plumbing, and the type in `src/types/index.ts`.
- Tests cover the two math libs (`*.test.ts`, excluded from the production tsc build via `tsconfig.app.json`).
