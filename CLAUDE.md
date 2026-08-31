# Budget Forecaster — architecture notes

Local-first personal finance forecaster. React + TypeScript (Vite) front end, Express + better-sqlite3 back end. Single user, no auth — everything is local. Optional Plaid integration pulls in real balances, transactions, and liability details.

## Run / test

```bash
npm install && cd server && npm install && cd ..
npm run dev      # API on :3001, client on :5173 (Vite proxies /api -> :3001)
npm test         # Vitest: src/lib/*.test.ts + server/lib/dates.test.mjs
npm run build    # tsc -b + vite build (test files excluded from the build)
```

The SQLite DB lives at `server/db/budget.db` (gitignored, WAL mode) and is created + seeded + migrated on first server boot. The server runs with `node --watch`, so editing `server/**` triggers a restart and re-runs migrations.

Plaid is optional and configured via `.env` at the repo root (see `.env.example`): `PLAID_CLIENT_ID`, `PLAID_ENV` (`sandbox` | `production`, defaults to sandbox), and the matching `PLAID_SANDBOX_SECRET` / `PLAID_PROD_SECRET`. With no credentials the whole Plaid surface reports `configured: false` and the rest of the app works normally.

## Data model (SQLite, all in `server/db/database.js`)

Core:

- `accounts` — cash accounts; name, balance, `is_primary`, `sort_order`, `plaid_account_id`. Exactly one primary; unallocated cash flows default to it.
- `income_sources` — name, monthly_amount (per-payment), `frequency`, `payday_1`/`payday_2` (semimonthly days; 31 = last day), `start_date`, `account_id` (null = primary), `group_id`, `sort_order`
- `expenses` — recurring costs; name, monthly_amount (per occurrence), `frequency`, `start_date`, `end_date` (retained for compat; normal expenses are ongoing), `funding_allocations`, `funding_rules`, `group_id`, `sort_order`
- `scheduled_payments` ("Future Expenses") — name, amount, `frequency`, `start_date`, `end_date` (nullable), legacy `funding_source_type`/`funding_source_id`, plus `funding_allocations`/`funding_rules`
- `debts` — name, balance, apr, credit_limit, monthly_payment, `debt_type` (`credit_card` = revolving/chargeable, `loan` = installment), `payment_day`, `account_id`, `funding_allocations`, `funding_rules`, `group_id`, `sort_order`, `plaid_account_id`, plus cached Plaid liability fields (`last_statement_balance`, `next_payment_due_date`, `last_payment_amount`, `is_overdue`, `plaid_aprs`, …)
- `line_item_groups` — name, `kind` ('income' | 'expense' | 'debt'), `sort_order`. Items reference a group via `group_id`; deleting a group **ungroups** its items (sets group_id NULL), never deletes them.
- `income_occurrences` — per-payday overrides keyed `(income_id, scheduled_date)`: `occurrence_date`, `status` (`expected` | `received` | `detected` | `skipped`), optional `transaction_id`. Cascades on income delete.
- `app_settings` — key/value. Keys: `starting_balance` (legacy, superseded by accounts), `currency`, `inflation_rate`, `debt_extra`, `debt_strategy`.
- `scenarios` — name + full JSON `snapshot` of all data.

Plaid cache (never exported, never part of a scenario):

- `plaid_items` — linked institutions: `item_id`, `access_token`, `cursor`, per-domain `*_synced_at` stamps, `liabilities_consent_required`
- `plaid_accounts` — cached account balances + Liabilities fields, keyed by Plaid `account_id`
- `plaid_transactions` — cached transactions, indexed by `(account_id, date)`

Schema/migrations are idempotent: tables use `CREATE TABLE IF NOT EXISTS`, and columns are added via `PRAGMA table_info` guards. A legacy `growth_rate_annual` column exists but is unused.

### Funding allocations & rules

The key modeling concept, shared by `expenses`, `scheduled_payments`, and `debts`. Both columns hold a JSON array; `server/lib/funding.js` (`cleanAllocations`, `cleanFundingRules`) validates them on write.

- `funding_allocations` — `{source_type: 'account'|'debt', source_id, alloc_type: 'percent'|'fixed', value}`. Fixed amounts apply first, then percentages of the full bill; **any remainder falls to the primary account**.
- `funding_rules` — the same shape plus `frequency`, `start_date`, `end_date`. If non-empty, rules take precedence over `funding_allocations`.

A portion funded by a `debt` source is not cash out — it becomes a **charge** on that card, added to its balance and repaid through the debt plan. Only credit cards are chargeable; a charge pointing at a loan or a deleted debt is surfaced in the header as an "Invalid funding target" warning.

## Back end (`server/`)

- `server.js` loads `.env`, mounts one router per resource under `/api/*` (income, expenses, scheduled, settings, groups, debts, accounts, plaid, scenarios) plus `/api` for export/import. CORS is locked to the Vite dev origin; JSON body limit 10mb.
- `routes/*.js` — CRUD per resource. List routes order by `lib/data.ORDER_BY` (sort_order, then id); reorderable resources expose `POST /<resource>/reorder` (body `{ids:[...]}`) which sets sort_order by index. Numeric inputs are validated (`isAmount`), dates via `lib/dates.normalizeDate`.
  - `income.js` also has `PUT/DELETE /:id/occurrences/:scheduledDate` for marking a payday received/skipped.
  - Deleting an account or debt strips it from every `funding_allocations`/`funding_rules` (`data.removeFundingAllocations`).
- `routes/plaid.js` — link + sync. `create_link_token` / `exchange_public_token` for linking; `items/:id/liabilities_link_token` for the update flow when an existing item needs Liabilities consent. `GET /accounts` and `GET /transactions` **serve the SQLite cache and refresh from Plaid in the background** (5-minute TTL; only the very first call blocks). `POST /transactions/sync` pulls cursor-based deltas, `POST /import_accounts` routes depository/investment → `accounts` and credit/loan → `debts`, `POST /resync` refreshes balances + liabilities into already-imported rows, `DELETE /items/:id` unlinks.
- `lib/data.js` — `exportData`/`importData` (full snapshot over `TABLES`, used by export/import **and** scenarios), `reorder`, `removeFundingAllocations`, `ORDER_BY`.
- `lib/dates.js` — `normalizeDate` / `dateError`, the single date-validation point (unit-tested).
- `lib/plaid.js` — env-driven client construction; `isConfigured()` gates every Plaid route.

## Front end (`src/`)

- `App.tsx` — single source of truth. Loads everything in one `Promise.all`, holds all state, wraps every mutation in `guard()` (errors → toast). Computes all derived series each render and passes them down. Tabs: Forecast / Savings / Net Worth / Breakdown / Overview / Activity / Outflows / Transactions, in a `NavMenu` that collapses to a hamburger on narrow screens. Tab, horizon (`months`), start month, and per-tab view prefs persist to localStorage under `bf.*`. Header surfaces three warnings: load errors, possible double-counting (a name appearing in Expenses + Future Expenses + Debts), and invalid funding targets.
- `lib/forecast.ts` — pure math, the bulk of the app's logic. `cashflowAtMonth` is the shared per-month engine so **Forecast net === Savings month-over-month delta**. `buildExpensePlan` resolves split funding into `ongoingCashOut` / per-account outflows / debt `charges`; `buildDebtCharges` does the same for future expenses. Then `buildForecast`, `buildSavings`, `buildNetWorth`, plus the per-entity series: `buildAccountSeries`, `buildAccountSavings`, `buildAccountActivity`, `buildDebtActivity`, `buildScheduledOutByAccount`, `buildDebtOutByAccount`, and the `build*Breakdown` family. Inflation compounds onto ongoing expenses. Income frequency: weekly/biweekly/semimonthly/monthly contribute every month; quarterly/annual/one-time arrive as lumps.
- `lib/debt.ts` — `simulateDebt` (independent per-debt amortization, used for row summaries) and `simulateDebtPlan` (combined avalanche/snowball with a global extra payment + rollover, accepting the charge stream and a per-debt payment schedule; returns per-month `outflow`, `remaining`, and `payoffMonthByDebt`). The plan's `outflow` feeds the forecast/savings math; `remaining` feeds net worth. **Guard:** if a payment ≤ first-month interest, the debt "never pays off" (don't loop forever).
- `lib/monthlyBreakdown.ts` — expands a single calendar month into dated line items with their funding sources and per-account/per-debt liquidity changes. Handles semimonthly paydays (weekend-adjusted) and income occurrence overrides.
- `lib/format.ts` — the single money-formatting config point (currency is module state, synced from settings; zero-decimal currencies handled).
- `lib/useDnd.ts` — minimal native drag-and-drop reorder hook; `sameBucket` keeps drops within a group. `useCollapsed` / `useCollapsedGroup` persist section + group open state; `useMediaQuery` drives the nav collapse.
- `api/client.ts` — one typed `*Api` object per resource, including `plaidApi`.
- `components/` — charts are `React.lazy` (Recharts is the bulk of the bundle). `Modal` traps focus + restores it. `ConfirmButton` is the two-step delete used everywhere. `Toolbar` handles scenarios + JSON export/import. `LineItemTable`/`Debts` render grouped sections (subtotal, collapse, rename, ungroup) and reuse `AddItemForm`/editors. `FundingPlanModal` edits allocations/rules. `PlaidConnect` + `Accounts` + `Transactions` cover linking, importing, and browsing synced data.

## Conventions / gotchas

- Money flows one way: components call `App` handlers → API → update local state. No refetch except after import/scenario-restore (`load()`).
- Grouping is generic across income/expense/debt via `line_item_groups.kind`; each table filters `groups` by its own kind.
- Anything funded from a debt is a charge, not cash — if you touch funding math, keep `buildExpensePlan`/`buildDebtCharges` and `simulateDebtPlan` in sync, and re-check that forecast net still equals the savings delta.
- Plaid data is a cache, not a source of truth: importing copies values into `accounts`/`debts`, and `plaid_account_id` is what blocks re-import and enables resync.
- When adding a reorderable/groupable/fundable field, remember: migration in `database.js`, ordering in the route, validation in `lib/funding.js` if it's an allocation, the `group_id`/`sort_order` plumbing, and the type in `src/types/index.ts`.
- Tests cover the math libs and date parsing (`*.test.ts` excluded from the production tsc build via `tsconfig.app.json`).
