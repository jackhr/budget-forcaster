# 01 — Product intent

## What it is

A local-first personal finance **forecaster** for one household. You describe your money: cash accounts, income, recurring bills, time-boxed payments, and debts (credit cards and loans), including *which account or card pays for what*. The app projects month by month:

- cash flow (income vs. money out),
- account balances (in total and per account),
- debt balances and payoff dates under a payoff strategy,
- net worth (cash − debt),
- and, within a single month, day-by-day timing and "how much can I spend".

It answers questions like: *Will checking go negative in March? When is the car loan paid off if I put an extra $200 on the cards? If this bill goes on a credit card, what happens to that card's balance and to my cash?*

It is **not** a transaction-categorizing budget app (like YNAB or Mint). Real bank data (Plaid) keeps balances current and confirms what actually happened. The plan itself is a model the user maintains.

**Budgets and buckets fit that, not the other way round.** A budget is a planned expense whose month-0 remainder is reconciled against Plaid's own categories — the user never categorizes a transaction. A bucket earmarks money inside an account without moving it, so "what can I spend" stops counting money that's already promised.

## Audience

- **Today:** multi-user. Each account holds one household's plan, isolated from every other account ([11](11-accounts-and-access.md)). Still self-hosted rather than a public service.
- **Direction:** built so it *could* run as a real product — the data model, auth and Plaid handling assume more than one household from here on. Don't reintroduce single-user shortcuts: no hard-coded people, institutions or account names; household data in the DB, never in code; server-persisted state over browser-only state for anything that affects numbers or must survive a device change.

## Principles (use these to break ties)

1. **Model reality truthfully, then warn.** Never silently move money to make numbers look valid. If a card is charged past its limit, the balance goes over the limit and the app flags it. If a funding target is invalid, the amount is surfaced as a warning, not quietly paid from cash.
2. **One engine, consistent views.** Every tab derives from the same computations. Forecast net for a month must equal the Savings balance change for that month, and per-account balances must sum to the total. See [07](07-forecast-pipeline.md).
3. **Money charged to a card is not cash out.** A card-funded portion becomes a debt *charge*. Cash leaves only when the card payment is made. See [05](05-funding.md).
4. **Simple by default, powerful on demand.** Every payable item has a one-click "Paid from" dropdown. Splits and date-ranged schedules live behind "Split or schedule…".
5. **Private by construction.** No telemetry. Plaid data is a cache, and Plaid tokens are encrypted at rest. Every query is scoped to one user; a missing `WHERE user_id` is a security bug, not a display bug. The repo is public, so data never goes in code or docs.
6. **Non-destructive edits.** Deleting a group ungroups its items. Deleting an account or debt re-routes whatever referenced it rather than deleting those items. Two-step confirm on every delete.

## Direction (owner-confirmed, not yet built)

These are decisions about where the app is heading. Don't contradict them; prefer changes that move toward them.

- **Day-level is the source of truth.** The monthly engine averages sub-monthly items (weekly = ×52/12) and ignores specific dates. The day-level Month view uses real dates. When the two disagree, the **day-level answer is right**. The monthly averaging is an approximation to replace over time. See [10](10-known-gaps-and-decisions.md#g1).
- **One cost entity** (done, 2026-09). Future Expenses were removed as a redundant second concept, and Expenses gained an optional `end_date`. Ongoing = no end date, temporary = start + end, one-off = `one-time`. Don't reintroduce a second cost table. See [10 G2](10-known-gaps-and-decisions.md#g2).
- **Plaid should reconcile more of month 0.** Plaid is the balance source (refreshing balances, APRs, minimums, and due dates), and it already detects debt payments and twice-monthly paychecks. Still to come: auto-detecting paid **expenses**, and received income for **all** frequencies. See [10 G4](10-known-gaps-and-decisions.md#g4).
- **Debt funding rules are temporary overrides** (settled and implemented): outside a rule's date window, a debt makes its normal monthly payment. See [10 Decisions](10-known-gaps-and-decisions.md#decisions).
- **Credit-limit behavior is settled:** cards absorb the full charge and get flagged over limit. Don't reintroduce caps or spill-to-cash. See [10](10-known-gaps-and-decisions.md#decisions).
