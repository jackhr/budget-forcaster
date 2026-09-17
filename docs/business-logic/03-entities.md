# 03 — Entities: meaning, rules, invariants

Column lists are in [CLAUDE.md](../../CLAUDE.md) and `src/types/index.ts`. This doc covers **semantics**: what each field means to the user, what defaults apply, what must always hold, and what happens on delete.

Common to all: money is a plain `REAL` in the display currency (no currency conversion). Dates are `YYYY-MM-DD` strings. The server's `normalizeDate` also accepts `YYYY-MM` and turns it into `YYYY-MM-01`. Invalid calendar dates are rejected with 400.

---

## Account (`accounts`)

- **Meaning:** a cash pile. `balance` is the balance **as of today**. The forecast treats it as the opening balance of month 0 (see [07](07-forecast-pipeline.md#month-0-semantics) for the double-count caveat).
- **Invariant: exactly one primary** whenever ≥1 account exists. It's enforced server-side by `ensurePrimary()` after every create, update, and delete. If there are several primaries or none, the first account by sort order becomes primary.
  - The first account ever created becomes primary.
  - A Plaid import makes the first imported cash account primary only if no primary exists yet.
- **At least one account must exist.** Deleting the last account returns 400.
- **Delete re-routes, never cascades:**
  - Income assigned to the account → `account_id = NULL` (primary).
  - Future expenses whose legacy source is this account → `funding_source_type = 'cash'` (primary).
  - The account is removed from every expense, future expense, and debt `funding_allocations`/`funding_rules`. Their remainders then fall to primary (or, for debts, see [05](05-funding.md#debt-payments)).
  - Debts with this `account_id` → `NULL` (primary).
- Negative balances are allowed (overdraft).
- Reorderable. Not groupable.

## Income source (`income_sources`)

- `monthly_amount` = **amount per payment**, not per month. A $2,000 biweekly paycheck is stored as 2000.
- `frequency`: `weekly | biweekly | semimonthly | monthly | quarterly | annually | one-time`. `semimonthly` is income-only in the UI. Expenses and future expenses don't offer it, though the math tolerates it.
- `start_date` is optional. Null means "active now" and anchors the cycle to the current month. See [04](04-scheduling.md) for how lumps are anchored (and a confirmed bug).
- `account_id`: where the money lands. Null means primary.
- `payday_1` / `payday_2`: only for `semimonthly`. Defaults are 15 and 31, and **31 means the last day of the month**. The server nulls them for other frequencies.
- `growth_rate_annual` is a legacy column. Unused; ignore it.
- **Occurrences** (`income_occurrences`, twice-monthly only): an override per scheduled payday, keyed `(income_id, scheduled_date)`.
  - `occurrence_date` must stay in the same month as `scheduled_date` (400 otherwise).
  - `status` is `expected | received | skipped` when stored. `detected` is computed at read time from Plaid ([09](09-plaid.md#income-detection)).
  - Cascade-deleted with the income source.
- Reorderable and groupable (`kind = 'income'`).

## Expense (`expenses`): *ongoing* costs

- `monthly_amount` = **amount per occurrence** at `frequency`.
- `start_date` is **required** on create and update. It is the first occurrence and anchors the cycle. Old rows got `date('now')` via migration.
- `end_date` is **always forced to NULL** on write (the migration also nulls existing values). Expenses are ongoing by definition. Time-boxed costs belong in future expenses (for now; see [10 G2](10-known-gaps-and-decisions.md#g2)).
- Funding: `funding_allocations` / `funding_rules`, with account or card sources. See [05](05-funding.md).
- **Inflation applies**: the amount compounds by `app_settings.inflation_rate`.
- Can be marked **paid this month** (manually; stored in `paid_status`), which skips month 0.
- Reorderable and groupable (`kind = 'expense'`).

## Future expense (`scheduled_payments`): *temporary* costs

- `amount` = per occurrence. `frequency` defaults to `one-time`.
- `start_date` is required. `end_date` is optional and inclusive (null = runs for the whole horizon). One-time ignores `end_date`.
- **No inflation.** Not reorderable (listed by `start_date`). Not groupable.
- Funding precedence: `funding_rules` → `funding_allocations` → legacy `funding_source_type/id`.
  - `funding_source_type` is `cash | income | debt | account`. `cash` and `income` both mean primary. The editors still write the legacy fields, mirroring the first allocation, for compatibility.
- Deleting an income source or debt resets matching legacy sources to `cash`.

## Debt (`debts`)

- `balance`: amount owed today, ≥ 0.
- `apr`: annual %, e.g. `19.9`. Monthly rate = `apr / 1200`.
- `monthly_payment`: the normal payment. It's also the payment in any month no funding rule window covers. **Required > 0 while `balance > 0`**; a $0 balance may carry $0. A Plaid import can still insert 0 when Plaid knows no payment at all, and the row then shows "never pays off" until the user sets one ([10 G9](10-known-gaps-and-decisions.md#g9)).
- `debt_type`:
  - `credit_card`: revolving. Chargeable. `credit_limit` is optional (null = no limit; no utilization or over-limit checks).
  - `loan`: installment. Not chargeable. The editor hides the limit.
  - The migration inferred `loan` for rows with no limit. A missing type in the math is treated as chargeable.
- `payment_day`: autopay day 1–31, optional. It drives the "paid this month" default and the day placement in the Month view.
- Who pays: `funding_rules` → `funding_allocations` → `account_id` → primary. **Debts can only be paid from accounts, never from another card** (`allowDebt: false` on write). See [05](05-funding.md#debt-payments).
- Plaid liability cache fields (`last_statement_balance`, `next_payment_due_date`, `last_payment_*`, `is_overdue`, `plaid_aprs`) are informational, filled by import and resync.
- **Paid this month:** see [Paid status](#paid-status-paid_status). Plaid-linked debts can be detected as paid.
- **Delete:** removed from every expense and future expense allocation and rule. Its `paid_status` rows are deleted. Legacy future-expense sources pointing at it are reset to `cash`. So a bill that was charged to that card **becomes a cash bill from primary**.
- Reorderable and groupable (`kind = 'debt'`).

## Paid status (`paid_status`)

- One row per `(entity_type, entity_id, month)`: `entity_type` ∈ `debt | expense`, `month` = `YYYY-MM`, `paid` = 0/1. **A row is a manual override.** No row means the default.
- `GET /api/paid` returns the **server's current month**: manual rows, plus Plaid-detected debts that have no manual row (`source: 'detected'`, with a `detail` reason). `PUT /api/paid/:type/:id {paid}` sets an override; `DELETE` clears it.
- Client precedence: manual → detected → autopay-day default (debts) / unpaid (expenses). A status fetched in an earlier month is ignored.
- Rows are deleted with their debt or expense. Included in export and scenarios.
- Old localStorage flags (`bf.debtPaid`, `bf.expensePaid`) migrate to the server once, on load.

## Group (`line_item_groups`)

- `kind` ∈ `income | expense | debt`. Each list shows only its own kind.
- Display only: subtotal, collapse (state in localStorage), rename, and drag-reorder within the group. **No effect on any calculation.**
- Deleting a group ungroups its items (`group_id = NULL`). It never deletes them.

## Settings (`app_settings`, key/value strings)

| key | meaning | default |
|---|---|---|
| `currency` | Display currency code (USD, EUR, GBP, CAD, AUD, JPY). Formatting only; no conversion. | `USD` |
| `inflation_rate` | Annual %, compounded monthly, **applied to expenses only**. | `0` |
| `debt_strategy` | `none \| avalanche \| snowball` | `none` |
| `debt_extra` | Extra monthly debt budget (ignored when strategy is `none`). | `0` |
| `starting_balance` | Legacy, pre-accounts. Only used to seed the first account and as a fallback when comparing old scenarios. | — |

## Scenario (`scenarios`)

- A full JSON snapshot of `server/lib/data.js:TABLES`: `accounts, line_item_groups, income_sources, income_occurrences, expenses, scheduled_payments, debts, app_settings, paid_status`.
- **Not included:** the Plaid cache tables and other scenarios.
- **Compare** re-runs a simplified pipeline over the snapshot (no paid-this-month, no occurrences) and overlays net, savings, and net worth.
- **Restore** is destructive: it deletes those tables and re-inserts the snapshot with the same ids. Export/Import use the same code. A table **missing from the snapshot** (older backups) keeps its current rows, minus rows whose parent no longer exists ([10 G8](10-known-gaps-and-decisions.md#g8)).

## Warnings the header computes

- **Possible double-counting:** the same name (trimmed, case-insensitive) appears more than once across expenses, future expenses, and debts. Typical mistake: entering a card payment as an expense *and* tracking the card as a debt. Dismissable per session.
- **Invalid funding target:** `plan.chargeOverflow > 0` in any month, meaning something is charged to a loan or a missing debt.
- **Load error:** the API is unreachable.
