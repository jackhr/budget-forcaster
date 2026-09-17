# 10 — Known gaps, confirmed bugs, and settled decisions

**Read this before changing behavior.** Items are tagged:
- **BUG:** confirmed wrong, with a reproduction.
- **GAP:** current behavior differs from owner-confirmed intent.
- **INCONSISTENCY:** two code paths disagree, and intent hasn't been decided yet.

When you fix something, move it to "Resolved" with the commit hash and update the topic doc.

## Open

<a id="g1"></a>

### G1: Monthly engine vs day engine disagree (GAP)
The monthly engine (`forecast.ts`) averages weekly and biweekly amounts, ignores the day of the month, applies inflation, and simulates debt. The day engine (`monthlyBreakdown.ts`) uses real dates but has no inflation, no debt simulation (interest, strategy, payoff, charges), and no split of debt allocations. **Intent: day-level is the source of truth.** Direction: move the forecast toward date-accurate occurrences, and share one occurrence generator and one funding resolver between both views. Until then, don't "fix" one engine to match the other's approximation. Fix toward date accuracy. *Deferred by the owner (2026-09) as a separate, planned refactor.*

<a id="g2"></a>

### G2: Expenses vs Future Expenses is a legacy split (GAP)
The two are nearly identical: both have frequency, start date, and funding. Differences: expenses force `end_date = NULL`, get inflation, can be marked paid, and are groupable and reorderable. Future expenses have an end date, legacy `funding_source_*`, no inflation, and no paid flag. **Intent: "ongoing vs temporary" expenses.** A refactor is welcome: one concept, or two with a clear ongoing/temporary distinction, sharing code paths. Watch for the double-counting warning, scenario and export compatibility (`TABLES`), legacy funding fields, and `paid_status` rows (`entity_type = 'expense'`). *Deferred by the owner (2026-09) as a separate, planned refactor.*

<a id="g4"></a>

### G4: Auto-reconcile the rest of month 0 from Plaid (GAP, partly done)
Done in `75bbb3b`:
- "Paid this month" is persisted server-side (`paid_status`, `/api/paid`).
- Plaid-linked **debt payments** are detected automatically ([09](09-plaid.md#debt-payment-detection)).

Still open:
- **Expenses** are never auto-detected, only marked manually. Matching bills to transactions (by amount, date window, and funding account) is the intended next step.
- **Income** is only reconciled for twice-monthly sources. Weekly, biweekly, monthly, and lump income have no month-0 adjustment, so a paycheck already in today's balance is counted again ([07 Month 0](07-forecast-pipeline.md#month-0-semantics)). This probably belongs with G1, since per-payday occurrences need a date-accurate engine.

### Minor notes
- Savings single-account payoff markers use `account_id` or primary and ignore allocations and rules.
- `groups` route error text says "(income|expense)", but `debt` is also valid.
- `growth_rate_annual` columns are unused legacy.
- A `paid_status` row is keyed by month and is never cleaned up. Old months are harmless: only the current month is read.
- Debt-payment detection trusts Plaid's liability fields. A late payment made within 30 days before this month's due date (but actually for last month) would count as this month's. A manual override fixes it.

<a id="decisions"></a>

## Settled decisions

These went back and forth in history. **Don't reopen them without the owner.**

| Decision | Settled rule | History |
|---|---|---|
| Credit limits | A card **absorbs the full charge**, goes over limit, and is **flagged** (badge + first over-limit month). No cap, no spill to cash. Only loan or missing targets are "uncovered". | cap (`2a4ca7c`) → no cap/flag (`d26edfa`) → cap + spill to cash (`2293426`) → spill left uncovered (`af90989`) → **absorb + flag** (`51ccc24`). Confirmed 2026-09. |
| Debt funding rules | **Temporary overrides.** In a month covered by a rule's date window, the in-window rules set the payment. Outside every window, the debt makes its normal payment from its default account and takes part in the strategy. | authoritative, $0 outside windows (`b1dbfe1`) → **temporary overrides** (`75bbb3b`). Confirmed 2026-09. |
| Card-funded means not cash | Charges add to the card and are repaid through its payment. They never reduce cash directly. | Stable since split funding was introduced. |
| Remainder for expenses and future expenses | Unallocated → primary account. | Stable. |
| Funding sources for debts | Accounts only, never another card (no balance-transfer modeling). | Stable. |
| Groups | Display only; deleting ungroups. | Stable. |
| Simple vs advanced funding UI | One dropdown by default (stored as a single 100% allocation); "Split or schedule…" for rules. | `9c50014`, `47249e2`, `d1c2520`. |
| Plaid $0 minimum | Never overwrite an existing `monthly_payment` with a $0 or missing minimum (cards and loans). | cards only (`82ac06c`) → all debts (`75bbb3b`). |
| Unlink keeps imported rows | Detach the link; reattach by name on relink. | `4ed3786`. |
| "Paid this month" precedence | Manual override → Plaid detection (debts) → autopay-day default (debts) / unpaid (expenses). Stored server-side. | localStorage (`fbae2a8`) → server + detection (`75bbb3b`). |
| Privacy | Repo is public: no household data in code, docs, tests, or commit messages. | Confirmed 2026-09. |

## Resolved

All in `75bbb3b` unless noted.

<a id="g3"></a>

### G3: Debt funding rules zeroed out months outside their windows (GAP → fixed)
`buildDebtPaymentSchedule` now returns `null` (no override) for months no rule window covers. A one-time rule's window is its start month; a rule is "in window" even in its frequency's off months, and pays 0 then. `debtPaymentByAccount` routes uncovered months like a debt without rules. The Month view emits the normal payment event in months with no covering rule. The FundingPlanModal helper text for debts was updated. Tests: `reverts to the normal payment and pay-from account after a funding rule ends`, `lets a debt rejoin avalanche rollover once its funding rule window closes`, `falls back to the normal debt payment in months outside every funding rule window`.

<a id="g5"></a>

### G5: Past-dated lump income re-anchored to the current month (BUG → fixed)
`incomeCashAtMonth` no longer clamps the start offset, so lumps anchor to their real start month, like expenses. Tests: `keeps a past-dated annual income in its real month`, `never repeats a past one-time income`.

<a id="g6"></a>

### G6: "Paid this month" was ignored under avalanche/snowball (BUG → fixed)
In the strategy branch of `simulateDebtPlan`, a debt paid this month pays nothing in month 0, contributes nothing to the rollover budget, and isn't a target for extra that month. Tests: `skips a paid debt under avalanche without giving its payment to other debts`, `skips a paid debt with a funding-plan override under snowball`.

<a id="g7"></a>

### G7: An expense charged to a deleted card vanished silently (INCONSISTENCY → fixed)
`buildExpensePlan` pushes charges for any card `source_id`. `simulateDebtPlan` flags unknown targets as `chargeOverflow`, which drives the header's "Invalid funding target" banner. The unused `debts` parameter was removed from `buildExpensePlan`. Test: `surfaces the charge as overflow instead of dropping it`.

<a id="g8"></a>

### G8: Scenario restore and JSON import wiped income occurrences (BUG → fixed)
`TABLES` now includes `income_occurrences` (after `income_sources`) and `paid_status` (last). `importData` **keeps** the current rows of any table the snapshot doesn't mention (older backups and scenarios), dropping rows whose parent no longer exists. Verified end to end against a copy of the DB: scenario restore and a legacy import both preserve occurrences and paid flags.

<a id="g9"></a>

### G9: Plaid import could create a debt with `monthly_payment = 0` (INCONSISTENCY → fixed)
- **API and editor:** `monthly_payment` must be > 0 **while a balance is owed**. A $0 balance may carry a $0 payment.
- **Import:** uses the Plaid minimum if > 0, else the last payment amount, else 0. A 0 then shows "never pays off", and the editor requires a payment on first edit, which is intended.
- **Resync:** never replaces a payment with a $0 or missing minimum, for any debt type.

<a id="g10"></a>

### G10: Percent funding rules ignored sub-monthly frequencies (INCONSISTENCY → fixed by definition)
Decided: a percent rule is a percentage of **each occurrence of the bill**, so only month-or-longer frequencies (monthly, quarterly, annually, one-time) mean anything for it. The modal only offers those for percent rules. `cleanFundingRules` normalizes weekly, biweekly, and semimonthly percent rules to monthly, which matches what the math already did.

<a id="g11"></a>

### G11: Resync could copy a stale cache (INCONSISTENCY → fixed)
`refreshAccountsCache` serializes refreshes. A background refresh (`GET /accounts`) is skipped while one runs. An explicit refresh (resync) waits for the in-flight one, then runs its own before copying values into accounts and debts.

<a id="g12"></a>

### G12: Month-view liquidity hid overdrafts (INCONSISTENCY → fixed)
Liquidity is no longer floored at $0. Accounts can project negative, and an over-limit card starts at `limit − balance` (negative). Cards are still capped at their limit. Test: `shows a projected overdraft as negative liquidity`.
