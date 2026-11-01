# Budget Forecaster — architecture notes

Personal finance forecaster. React + TypeScript (Vite) front end, Express + better-sqlite3 back end. **Multi-user**: every row belongs to a user and every route except `/api/health` and `/api/auth/*` requires a session. Optional Plaid integration pulls in real balances, transactions, and liability details.

**Business rules, product intent, and known bugs live in [docs/business-logic/](docs/business-logic/README.md).** This file is the architecture map. Before changing any money math or behavior, read `docs/business-logic/10-known-gaps-and-decisions.md` (settled decisions, and gaps between current and intended behavior). **Before adding a route or a table, read `docs/business-logic/11-accounts-and-access.md`** — a missing `WHERE user_id = ?` is a cross-tenant leak. Deliberately-deferred work is in [docs/ICEBOX.md](docs/ICEBOX.md). The repo is public: never put real household data in code, docs, tests, or commit messages.

## Run / test

```bash
npm install && cd server && npm install && cd ..
npm run dev      # API on :3001, client on :5173 (Vite proxies /api -> :3001)
npm test         # Vitest: src/lib + src/components render tests + server/lib (incl. HTTP tenant-isolation tests)
npm run build    # tsc -b + vite build (test files excluded from the build)
```

The SQLite DB lives at `server/db/budget.db` (gitignored, WAL mode) and is created + seeded + migrated on first server boot. The server runs with `node --watch`, so editing `server/**` triggers a restart and re-runs migrations. `BF_DB_PATH` points it at another file (tests use a scratch DB); `NODE_ENV=test` skips demo seeding.

**First run after auth:** the app opens on a landing page. Create an account — the first account registered on a database with pre-auth rows adopts all of them.

Plaid is optional and configured via `.env` at the repo root (see `.env.example`): `PLAID_CLIENT_ID`, `PLAID_ENV` (`sandbox` | `production`, defaults to sandbox), and the matching `PLAID_SANDBOX_SECRET` / `PLAID_PROD_SECRET`. With no credentials the whole Plaid surface reports `configured: false` and the rest of the app works normally.

## Data model (SQLite, all in `server/db/database.js`)

Identity:

- `users` — `email` + `email_normalized` (unique, lowercased), `password_hash` (scrypt), `name`
- `sessions` — `token_hash` (SHA-256 of the cookie token), `user_id`, `expires_at`, `user_agent`, `ip`

**Every table below carries `user_id`** (nullable, `ON DELETE CASCADE`), and every query must scope by it. `app_settings` is keyed `(user_id, key)` and `paid_status` `(user_id, entity_type, entity_id, month)`. See [11](docs/business-logic/11-accounts-and-access.md).

Core:

- `accounts` — cash accounts; name, balance, `is_primary`, `sort_order`, `plaid_account_id`. Exactly one primary; unallocated cash flows default to it.
- `income_sources` — name, monthly_amount (per-payment), `frequency`, `payday_1`/`payday_2` (semimonthly days; 31 = last day), `start_date`, `account_id` (null = primary), `group_id`, `sort_order`
- `expenses` — every cost; name, monthly_amount (per occurrence), `frequency`, `start_date`, `end_date` (optional, inclusive; null = ongoing, forced null for `one-time`), `funding_allocations`, `funding_rules`, `group_id`, `sort_order`. Ongoing = no end date, temporary = start + end, one-off = `one-time`; a future `start_date` shows an orange "Future" tag.
- `debts` — name, balance, apr, credit_limit, monthly_payment, `debt_type` (`credit_card` = revolving/chargeable, `loan` = installment), `payment_day`, `account_id`, `funding_allocations`, `funding_rules`, `group_id`, `sort_order`, `plaid_account_id`, plus cached Plaid liability fields (`last_statement_balance`, `next_payment_due_date`, `last_payment_amount`, `is_overdue`, `plaid_aprs`, …)
- `line_item_groups` — name, `kind` ('income' | 'expense' | 'debt'), `sort_order`. Items reference a group via `group_id`; deleting a group **ungroups** its items (sets group_id NULL), never deletes them.
- `income_occurrences` — per-payday overrides keyed `(income_id, scheduled_date)`: `occurrence_date`, `status` (`expected` | `received` | `detected` | `skipped`), optional `transaction_id`. Cascades on income delete.
- `paid_status` — "paid this month" manual overrides for debts/expenses, keyed `(entity_type, entity_id, month)`. No row = default (Plaid detection → autopay day for debts; unpaid for expenses).
- `app_settings` — per-user key/value. Keys: `starting_balance` (legacy, superseded by accounts), `currency`, `inflation_rate`, `debt_extra`, `debt_strategy`.
- `scenarios` — name + full JSON `snapshot` of all data.

Plaid cache (never exported, never part of a scenario):

- `plaid_items` — linked institutions: `item_id`, `access_token`, `cursor`, per-domain `*_synced_at` stamps, `liabilities_consent_required`, `error_code` (Plaid ITEM_ERROR such as `ITEM_LOGIN_REQUIRED`; null = healthy)
- `plaid_accounts` — cached account balances + Liabilities fields, keyed by Plaid `account_id`
- `plaid_transactions` — cached transactions, indexed by `(account_id, date)`; `category` (primary) + `category_detailed`

Schema/migrations are idempotent: tables use `CREATE TABLE IF NOT EXISTS`, and columns are added via `PRAGMA table_info` guards. A legacy `growth_rate_annual` column exists but is unused.

### Funding allocations & rules

The key modeling concept, shared by `expenses` and `debts`. Both columns hold a JSON array; `server/lib/funding.js` (`cleanAllocations`, `cleanFundingRules`) validates them on write.

- `funding_allocations` — `{source_type: 'account'|'debt', source_id, alloc_type: 'percent'|'fixed', value}`. Fixed amounts apply first, then percentages of the full bill; **any remainder falls to the primary account**.
- `funding_rules` — the same shape plus `frequency`, `start_date`, `end_date`. If non-empty, rules take precedence over `funding_allocations`.

A portion funded by a `debt` source is not cash out — it becomes a **charge** on that card, added to its balance and repaid through the debt plan. Only credit cards are chargeable; a charge pointing at a loan or a deleted debt is surfaced in the header as an "Invalid funding target" warning.

## Back end (`server/`)

- `server.js` loads `.env`, then: CORS (locked to `CLIENT_ORIGIN`, `credentials: true` so the session cookie travels), JSON body limit 10mb, `cookie-parser`, `attachUser`. Public routes (`/api/health`, `/api/auth`) mount first, then **`app.use('/api', requireAuth)`**, then one router per resource (income, expenses, settings, groups, debts, accounts, plaid, scenarios) plus `/api` for export/import. New routers are authenticated by default because the gate is mounted above them.
- `routes/auth.js` — register / login / logout / `GET me` / `PUT password`. `lib/auth.js` holds scrypt hashing, session issue+lookup, cookie options, and the `attachUser` / `requireAuth` middleware.
- `lib/secrets.js` — AES-256-GCM for Plaid access tokens (`APP_SECRET`, else a gitignored key generated on first boot). Legacy plaintext values still read and are re-encrypted on write.
- `routes/*.js` — CRUD per resource (plus `paid.js` → `/api/paid` for paid-this-month status + Plaid debt-payment detection via `lib/paidDetection.js`). List routes order by `lib/data.ORDER_BY` (sort_order, then id); reorderable resources expose `POST /<resource>/reorder` (body `{ids:[...]}`) which sets sort_order by index. Numeric inputs are validated (`isAmount`), dates via `lib/dates.normalizeDate`.
  - `income.js` also has `PUT/DELETE /:id/occurrences/:scheduledDate` for marking a payday received/skipped.
  - Deleting an account or debt strips it from every `funding_allocations`/`funding_rules` (`data.removeFundingAllocations`).
- `routes/plaid.js` — link + sync. `create_link_token` / `exchange_public_token` for linking; `items/:id/liabilities_link_token` for the update flow when an existing item needs Liabilities consent. `GET /accounts` and `GET /transactions` **serve the SQLite cache and refresh from Plaid in the background** (5-minute TTL; only the very first call blocks). `POST /transactions/sync` pulls cursor-based deltas, `POST /import_accounts` routes depository/investment → `accounts` and credit/loan → `debts`, `POST /resync` refreshes balances + liabilities into already-imported rows (and moves rows onto reissued card numbers via `lib/plaidAccounts.js`), `DELETE /items/:id` unlinks. Account refresh and transaction sync handle failures **per item**: a Plaid ITEM_ERROR is saved to `plaid_items.error_code` and that item is skipped, so one broken login never blocks the others. Errored items don't count toward cache staleness. The UI shows **Reconnect**, which reuses the update-mode link token; a later successful call clears the code.
- `lib/data.js` — `exportData`/`importData` (full snapshot over `TABLES`, used by export/import **and** scenarios; tables missing from a snapshot keep their rows). Export strips `user_id`, import re-applies the current user's, so a snapshot restores into any account. `reorder`, `removeFundingAllocations` and friends all take `userId`.
- `lib/dates.js` — `normalizeDate` / `dateError`, the single date-validation point (unit-tested).
- `lib/plaid.js` — env-driven client construction; `isConfigured()` gates every Plaid route.

## Front end (`src/`)

**Styling is Tailwind v4** (`@tailwindcss/vite`); **icons are [lucide-react](https://lucide.dev)** — never a unicode glyph or emoji. Design tokens live in one `@theme` block in `src/index.css` — Tailwind generates utilities from them (`bg-surface`, `text-muted`, `rounded-card`) and the not-yet-migrated components read the same names via `var(--color-*)`. Build anything new from `src/ui/` (`Card`, `Panel`, `PanelHeader`, `Section`, `Button`, `IconButton`, `Field`, `FieldError`, `MoneyInput`, `PercentInput`, `Pill`, `Banner`, `PaidToggle`, `AddButton`, `EmptyState`, `ModalActions`, `CollapseToggle`, `GroupBar`); per-component inline styles are what made the old UI drift.

- `auth/` — `AuthProvider` (session state, and a global 401 handler that drops to signed-out), `AuthGate` (landing vs. auth form vs. app), `Landing`, `AuthScreen`, `UserMenu`.
- `components/AppShell.tsx` — sidebar + content shell. Nav is grouped (Home / **Plan** / **Views**); collapses to a drawer under 900px. Takes the page `title`, `actions` and `banners`.
- `components/Home.tsx` + `lib/home.ts` — the default page. `findRunwayRisk` names the **first account** projected to go negative (a healthy total can hide one overdrawn account), `findCashLow` the low-water mark, `upcomingEvents` the next 30 days across two month breakdowns.

- `App.tsx` — single source of truth. Loads everything in one `Promise.all` (including `/api/paid`), holds all state, wraps every mutation in `guard()` (errors → toast). Computes all derived series each render and passes them down. **Planning and viewing are separate**: the editors render only on the Plan pages (Accounts / Income / Expenses / Debts), never under a view. Pages: Home · Plan(4) · Projections (one page with a cash-flow/savings/net-worth/overview switcher) · Breakdown · Activity · Outflows · Transactions. Page, horizon (`months`), start month, and per-view prefs persist to localStorage under `bf.*`. Three warnings surface as `banners`: load errors, possible double-counting (a name in both Expenses and Debts), and invalid funding targets.
- `lib/forecast.ts` — pure math, the bulk of the app's logic. `cashflowAtMonth` is the shared per-month engine so **Forecast net === Savings month-over-month delta**. `buildExpensePlan` resolves split funding into `ongoingCashOut` / per-account outflows / debt `charges`. Then `buildForecast`, `buildSavings`, `buildNetWorth`, plus the per-entity series: `buildAccountSeries`, `buildAccountSavings`, `buildAccountActivity`, `buildDebtActivity`, `buildDebtOutByAccount`, and the `build*Breakdown` family. Inflation compounds onto ongoing expenses. Income frequency: weekly/biweekly/semimonthly/monthly contribute every month; quarterly/annual/one-time arrive as lumps.
- `lib/debt.ts` — `simulateDebt` (independent per-debt amortization, used for row summaries) and `simulateDebtPlan` (combined avalanche/snowball with a global extra payment + rollover, accepting the charge stream and a per-debt payment schedule; returns per-month `outflow`, `remaining`, and `payoffMonthByDebt`). The plan's `outflow` feeds the forecast/savings math; `remaining` feeds net worth. **Guard:** if a payment ≤ first-month interest, the debt "never pays off" (don't loop forever).
- `lib/monthlyBreakdown.ts` — expands a single calendar month into dated line items with their funding sources and per-account/per-debt liquidity changes. Handles semimonthly paydays (weekend-adjusted) and income occurrence overrides.
- `lib/format.ts` — the single money-formatting config point (currency is module state, synced from settings; zero-decimal currencies handled).
- `lib/useDnd.ts` — minimal native drag-and-drop reorder hook; `sameBucket` keeps drops within a group. `useCollapsed` / `useCollapsedGroup` persist section + group open state; `useMediaQuery` drives the nav collapse.
- `api/client.ts` — one typed `*Api` object per resource, including `plaidApi`.
- `components/` — charts are `React.lazy` (Recharts is the bulk of the bundle). `Modal` traps focus + restores it. `ConfirmButton` is the two-step delete used everywhere. `Toolbar` handles scenarios + JSON export/import. `LineItemTable`/`Debts` render grouped sections (subtotal, collapse, rename, ungroup) and reuse `AddItemForm`/editors. `FundingPlanModal` edits allocations/rules. `PlaidConnect` + `Accounts` + `Transactions` cover linking, importing, and browsing synced data.

## Conventions / gotchas

- Money flows one way: components call `App` handlers → API → update local state. No refetch except after import/scenario-restore (`load()`).
- Grouping is generic across income/expense/debt via `line_item_groups.kind`; each table filters `groups` by its own kind.
- Anything funded from a debt is a charge, not cash — if you touch funding math, keep `buildExpensePlan` and `simulateDebtPlan` in sync, and re-check that forecast net still equals the savings delta.
- Plaid data is a cache, not a source of truth: importing copies values into `accounts`/`debts`, and `plaid_account_id` is what blocks re-import and enables resync.
- When adding a reorderable/groupable/fundable field, remember: migration in `database.js`, ordering in the route, validation in `lib/funding.js` if it's an allocation, the `group_id`/`sort_order` plumbing, and the type in `src/types/index.ts`.
- When adding a **route**: scope every query by `user_id`, return 404 (not 403) for another user's row, and add a case to `server/lib/isolation.test.mjs`.
- When adding **UI**: compose `src/ui/` primitives and Tailwind utilities. Don't add new inline-style components; migrating the remaining ones is in progress (done: the Plan pages — `LineItemTable`/`LineItemRow`/`AddItemForm`/`Debts` plus `Modal`/`ConfirmButton`/`CollapseToggle`. Left: `Accounts`, `FundingPlanModal`, `PlaidConnect`, `Transactions`, the activity/outflow views, and the charts).
- **An accent is a name, not a color.** `src/ui/accent.ts` maps `'income' | 'expense' | 'debt'` to literal utility strings; components take the name and look them up. Never pass a color down as a prop — Tailwind only generates utilities it can see as literal text in a source file, so a `var(--color-x)` prop can't be tinted (`bg-income/15`) or made into a border, and interpolating one (`` `${color}1f` ``) produces invalid CSS that the browser silently drops.
- **Don't override a variant's colors through `className`.** Two utilities for the same property sit in the same layer, so stylesheet order decides the winner, not intent. Use the variant that fits, add one, or use `Button variant="bare"` (layout only) and let `className` supply the fill. `src/components/planPages.test.tsx` guards this.
- A `style` attribute is allowed only for a genuinely computed value — `Modal`'s per-dialog `maxWidth`, a chart bar's height. `planPages.test.tsx` asserts the Plan pages render none at all.
- **Icons are Lucide components**, sized 11–17px with `strokeWidth` 1.9–2.6 and `aria-hidden` (or an `aria-label` when the icon is the only label). The two exceptions are deliberate: the brand mark is a hand-drawn SVG, and `<option>` text can't hold an SVG, so the primary-account marker stays a `★` there.
- **Never put a base style outside a `@layer`** in `index.css`. Unlayered CSS beats layered CSS regardless of specificity, so a bare `button { … }` silently kills Tailwind utilities app-wide.
- Tests cover the math libs, date parsing, and render-level invariants for the shell and the Plan pages (`*.test.ts` excluded from the production tsc build via `tsconfig.app.json`).
