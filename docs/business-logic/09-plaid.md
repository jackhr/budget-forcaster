# 09 — Plaid: linking, import, resync, transactions

Code: `server/routes/plaid.js`, `server/lib/plaid.js`, `src/components/PlaidConnect.tsx`, `src/components/Transactions.tsx`, income detection in `server/routes/income.js`.

## Role

**Plaid data is a cache, not the plan.** Importing *copies* values into `accounts` and `debts`, and the user can edit them freely afterwards. A resync overwrites balance-type fields. Plaid tables are never exported or included in scenarios. The whole feature is optional: without credentials, `/status` reports `configured: false` and the rest of the app works.

**Direction** (owner-confirmed): Plaid is the balance source, and **auto-reconciles actuals**. Done: debt payments ([below](#debt-payment-detection)) and twice-monthly paychecks ([below](#income-detection)). Still open: bills (expenses), and income of other frequencies ([10 G4](10-known-gaps-and-decisions.md#g4)).

## Configuration

- `PLAID_ENV` = `sandbox` (default) or `production`.
- `PLAID_CLIENT_ID` is shared. The secret is `PLAID_SANDBOX_SECRET` or `PLAID_PROD_SECRET`, depending on the env.
- Link requests `transactions` with `liabilities` as an additional consented product, 730 days of history, US only.
- `client_user_id` is the constant `local-user`, a single-user assumption.

## Lifecycle

1. **Link:** `create_link_token` → Plaid Link → `exchange_public_token`. This stores `plaid_items(item_id, access_token, institution_name)`. Relinking the same item updates its token. Several logins at one bank are separate items.
2. **Browse accounts:** `GET /accounts` serves the `plaid_accounts` cache. If the cache is empty it fills it synchronously; if it's stale (any healthy item older than **5 min**) it refreshes **in the background** and returns the cached data immediately. Each account says whether it's `imported`.
3. **Import** (`POST /import_accounts`, the user picks accounts; everything not yet imported is pre-selected):
   - `depository`, `investment`, and anything else → **account**, `balance = current`. It becomes primary only if no primary exists.
   - `credit` → **debt** `credit_card`: `balance = max(0, current)`, `credit_limit = limit`.
   - `loan` → **debt** `loan`: no limit.
   - Debt APR and due day come from the cached Liabilities data when available (otherwise APR = 0). Payment = the Plaid minimum if > 0, else the last payment amount, else 0. A 0 shows "never pays off" until the user sets a payment.
   - Name = `"<Plaid name> ••<mask>"`, truncated to 60 characters.
   - **No double import:** an account is skipped if its `plaid_account_id` **or** its generated name already exists in `accounts` or `debts`.
4. **Resync** (`POST /resync`, per item or all; manual, plus automatic after a Liabilities or reconnect update flow). Refreshes the cache (waiting for any in-flight background refresh first, so it never copies a half-updated cache), then for each cached Plaid account:
   - Account rows: `balance = current`.
   - Debt rows:
     - `balance = max(0, current)`.
     - `credit_limit`, `apr`, and `payment_day` (from the next due date) are updated only when Plaid has a value.
     - `monthly_payment` = Plaid minimum **only when it's > 0**. A $0 or missing minimum keeps the existing payment, for cards and loans alike, because a $0 minimum usually means a paid statement, not "stop paying".
     - The liability cache fields are overwritten.
   - **Matching:** first by `plaid_account_id`. Otherwise by generated name, for rows with no link **or a dangling link** (commit `4ed3786`), and in that case the link is backfilled.
5. **Unlink** (`DELETE /items/:id`): removes the item at Plaid (best effort) and deletes its cached transactions and accounts. **Imported rows are kept** with `plaid_account_id = NULL`, so a relink reattaches them by name on the next resync.

## Liabilities

- Fetched at most every **24h** per item, with the account refresh.
- `ADDITIONAL_CONSENT_REQUIRED` sets `liabilities_consent_required = 1`. The UI then shows "Enable liabilities", which opens Link in update mode (`items/:id/liabilities_link_token`) followed by a forced resync. Items that need consent are skipped unless `force_liabilities`.
- APR preference: the `purchase_apr` entry, else the first APR. Student loans and mortgages map their interest rate, next payment, and due date.
- "Not supported" or "not ready" product errors are silent.

## Error handling (per item)

A Plaid `ITEM_ERROR` (e.g. `ITEM_LOGIN_REQUIRED`) is saved to `plaid_items.error_code`, and **that item is skipped**. Other items keep refreshing and syncing. Errored items don't count toward staleness, so one broken login doesn't trigger constant refreshes. The UI shows **Reconnect** (same update-mode token). The next successful call clears the code. (Commit `b472a3d`.)

## Transactions

- Cached in `plaid_transactions` through cursor-based `/transactions/sync` (added, modified, removed), paged 500 at a time. The first sync pulls up to 730 days.
- `GET /transactions?account_id&days` reads from the cache (`days` = `all` by default, or 1–730). Items that have **never** synced (and aren't errored) are synced first. `POST /transactions/sync` forces deltas for all items.
- **Sign convention (Plaid):** a positive `amount` is money **out** (a purchase or charge); a negative amount is money **in** (a refund, payment, or deposit).
- The stored `name` is the merchant name when present. `category` is Plaid's `personal_finance_category.primary` (e.g. `INCOME`), else the legacy category.
- The Transactions tab defaults to the first credit account and "all" history. Browsing only.

## Debt payment detection

In `server/lib/paidDetection.js:detectDebtPayment`, run by `GET /api/paid` for every **Plaid-linked** debt without a manual override for the current month. Computed on read, never stored. The first matching rule wins:

1. **Paid this month:** liabilities `last_payment_date` is in the current month.
2. **Paid early:** `next_payment_due_date` is after this month, the due date that fell *in* this month (next due − 1 month) exists, and `last_payment_date` is within the 30 days before that due date. Example: a card due on the 2nd, paid 08-28, next due 10-02 → September's payment is covered.
3. **Payment transaction:** a transaction on the linked account this month with `amount < 0` and category `LOAN_PAYMENTS`.

A detected debt is paid for month 0 ([06](06-debt.md#paid-this-month)). The reason string (e.g. "Plaid: paid $X on DATE") shows in the paid button's tooltip. A manual override always wins, so a wrong detection is fixed by clicking the button. Liability data refreshes at most every 24h, while transactions sync on their own schedule.

## Income detection

In `server/routes/income.js:serialize`, computed on every income read and **never stored**:

- **Only** twice-monthly income, **only** the current month, **only** if the landing account (`account_id` or primary) is Plaid-linked.
- Candidates: transactions on that Plaid account this month with `amount < 0` and `category = 'INCOME'`.
- For each scheduled payday without a saved override, pick the closest unused candidate within **±5 days** whose absolute amount is within **max($25, 15% of expected)**. Ties go to the smaller amount difference.
- A match produces an occurrence with `status: 'detected'`, the actual date, the transaction name, and the actual amount. Effects:
  - The forecast drops it from month 0.
  - The Month view shows the actual amount and date.
  - A saved override (received, skipped, or a moved date) always wins over detection.
