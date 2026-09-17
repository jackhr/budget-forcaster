# 10 — Known gaps, confirmed bugs, and settled decisions

**Read this before changing behavior.** Items are tagged:
- **BUG:** confirmed wrong, with a reproduction.
- **GAP:** current behavior differs from owner-confirmed intent.
- **INCONSISTENCY:** two code paths disagree, and intent hasn't been decided yet.

When you fix something, move it to "Resolved" with the commit hash and update the topic doc.

## Open

<a id="g1"></a>

### G1: Monthly engine vs day engine disagree (GAP)
The monthly engine (`forecast.ts`) averages weekly and biweekly amounts, ignores the day of the month, applies inflation, and simulates debt. The day engine (`monthlyBreakdown.ts`) uses real dates but has no inflation, no debt simulation (interest, strategy, payoff, charges), and no split of debt allocations. **Intent: day-level is the source of truth.** Direction: move the forecast toward date-accurate occurrences, and share one occurrence generator and one funding resolver between both views. Until then, don't "fix" one engine to match the other's approximation. Fix toward date accuracy.

<a id="g2"></a>

### G2: Expenses vs Future Expenses is a legacy split (GAP)
The two are nearly identical: both have frequency, start date, and funding. Differences: expenses force `end_date = NULL`, get inflation, can be marked paid, and are groupable and reorderable. Future expenses have an end date, legacy `funding_source_*`, no inflation, and no paid flag. **Intent: "ongoing vs temporary" expenses.** A refactor is welcome: one concept, or two with a clear ongoing/temporary distinction, sharing code paths. Watch for the double-counting warning, scenario and export compatibility (`TABLES`), and legacy funding fields.

<a id="g3"></a>

### G3: Debt funding rules zero out months outside their windows (GAP)
Current (`buildDebtPaymentSchedule`, deliberately made "authoritative" in `b1dbfe1`): once a debt has any rule, a month with no active rule pays **$0** and skips strategy rollover. **Intent:** rules are temporary overrides. Outside every rule window, the debt reverts to `monthly_payment` from its default account (allocations, then `account_id`, then primary) and takes part in the strategy as normal. When fixing, also:
- Update the FundingPlanModal helper text for debts ("months without an active rule make no payment").
- Update `debtPaymentByAccount` so uncovered months route like the no-rules case.
- Update the Month view's debt events.
- Update the tests `a funding plan prevents avalanche rollover… including zero-payment months` and `does not use the existing pay-from account before a future funding plan starts`, which encode the current behavior.

<a id="g4"></a>

### G4: "Paid this month" lives in browser localStorage (GAP)
`bf.debtPaid` / `bf.expensePaid` are per browser, not in exports or scenarios, and invisible to the server. **Intent:**
- Persist them server-side (similar to `income_occurrences`).
- Auto-reconcile from Plaid transactions: mark debt payments and bills paid, and income received for all frequencies, not just twice-monthly.
- Add the same kind of month-0 adjustment for weekly, biweekly, monthly, and lump income, which today have none ([07 Month 0](07-forecast-pipeline.md#month-0-semantics)).

<a id="g5"></a>

### G5: Past-dated lump income re-anchors to the current month (BUG)
`incomeCashAtMonth` clamps `startOff` to ≥ 0. An annual, quarterly, or one-time income whose `start_date` is in the past is treated as starting this month. Repro: an annual income with `start_date 2027-01-01`, viewed in Feb 2027, forecasts payments in **Feb 2027 and Feb 2028** instead of Jan 2028. A past one-time income shows up again this month. Expenses and future expenses anchor correctly (no clamp). Fix: anchor like `expenseOccurrenceAtMonth`, and add a test.

<a id="g6"></a>

### G6: "Paid this month" is ignored for debts under avalanche/snowball (BUG)
`simulateDebtPlan` only applies `paidThisMonth` (via `minOf`) in the `strategy === 'none'` branch. With a strategy active, a debt marked paid (including the autopay-day default) still pays in month 0: cash is double-counted and the balance drops twice. Repro: `simulateDebtPlan([{balance:1000, apr:0, monthly_payment:200}], 0, 'avalanche', 2, [], undefined, new Set([id]))` → month-0 payment 200, where `none` gives 0. The existing test only covers `none`. Fix it in the strategy branch too, and decide whether a paid debt's payment still counts toward the rollover budget. (It probably shouldn't in month 0.)

<a id="g7"></a>

### G7: An expense charged to a deleted card vanishes silently (INCONSISTENCY)
In `buildExpensePlan`, a card portion whose `source_id` isn't in `debts` is neither charged nor paid in cash, and isn't flagged. The same situation in a future expense goes to `chargeOverflow` (the header warning). Server deletes strip these references, so it's rare (imports and restores can still produce it). Principle 1 says flag it: route it to overflow.

<a id="g8"></a>

### G8: Scenario restore and JSON import wipe income occurrences (BUG, by inspection)
`importData` deletes `income_sources`. With `foreign_keys = ON`, that cascades to `income_occurrences`, and occurrences aren't in `TABLES`, so they aren't restored. Received, skipped, and moved paydays are lost. Fix: add `income_occurrences` to `TABLES` after `income_sources`.

<a id="g9"></a>

### G9: Plaid import can create a debt with `monthly_payment = 0` (INCONSISTENCY)
The API requires a payment > 0, but import inserts the Plaid minimum, which may be 0. Such a debt has a first-edit validation error and `simulateDebt` reports "never pays off".

<a id="g10"></a>

### G10: Percent funding rules ignore sub-monthly frequencies (INCONSISTENCY)
`fundingRuleValue` gates percent rules only for quarterly, annually, and one-time. A weekly percent rule contributes once a month, while a weekly fixed rule contributes ×52/12.

<a id="g11"></a>

### G11: Resync can copy a stale cache (INCONSISTENCY)
`refreshAccountsCache` returns immediately if a refresh is already running (`accountsRefreshing`). A resync that starts during a background refresh then copies the not-yet-refreshed cache into accounts and debts.

<a id="g12"></a>

### G12: Month-view liquidity hides overdrafts (INCONSISTENCY)
Account liquidity is clamped at `≥ 0`. A projected overdraft reads as $0 available instead of negative. That conflicts with principle 1 (model truthfully, then warn).

### Minor notes
- Savings single-account payoff markers use `account_id` or primary and ignore allocations and rules.
- `groups` route error text says "(income|expense)", but `debt` is also valid.
- `growth_rate_annual` columns are unused legacy.

<a id="decisions"></a>

## Settled decisions

These went back and forth in history. **Don't reopen them without the owner.**

| Decision | Settled rule | History |
|---|---|---|
| Credit limits | A card **absorbs the full charge**, goes over limit, and is **flagged** (badge + first over-limit month). No cap, no spill to cash. Only loan or missing targets are "uncovered". | cap (`2a4ca7c`) → no cap/flag (`d26edfa`) → cap + spill to cash (`2293426`) → spill left uncovered (`af90989`) → **absorb + flag** (`51ccc24`). Confirmed 2026-09. |
| Card-funded means not cash | Charges add to the card and are repaid through its payment. They never reduce cash directly. | Stable since split funding was introduced. |
| Remainder for expenses and future expenses | Unallocated → primary account. | Stable. |
| Funding sources for debts | Accounts only, never another card (no balance-transfer modeling). | Stable. |
| Groups | Display only; deleting ungroups. | Stable. |
| Simple vs advanced funding UI | One dropdown by default (stored as a single 100% allocation); "Split or schedule…" for rules. | `9c50014`, `47249e2`, `d1c2520`. |
| Plaid $0 minimum on a card | Keep the existing `monthly_payment`. | `82ac06c`. |
| Unlink keeps imported rows | Detach the link; reattach by name on relink. | `4ed3786`. |
| Privacy | Repo is public: no household data in code, docs, tests, or commit messages. | Confirmed 2026-09. |

## Resolved

_(none yet)_
