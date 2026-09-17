# 04 — Scheduling: frequencies, dates, and which month things land in

There are **two scheduling engines** that can disagree. Know which one you're touching:

| | Monthly engine | Day engine |
|---|---|---|
| Code | `src/lib/forecast.ts` (`incomeCashAtMonth`, `expenseOccurrenceAtMonth`, `paymentCashAtMonth`, `fundingRuleValue`) | `src/lib/monthlyBreakdown.ts` (`occurrenceDates`, `incomeOccurrenceDates`) |
| Feeds | Forecast, Savings, Net Worth, Breakdown (range), Overview, Activity, Outflows, debt plan | Breakdown → Month view (daily chart, calendar, liquidity) |
| Granularity | Month offset only. **The day of the month is ignored.** | Real calendar dates |
| Owner intent | Approximation, to be replaced | **Source of truth** ([01](01-product-intent.md#direction-owner-confirmed-not-yet-built)) |

## Month offset

`monthOffset(date, now) = (year − nowYear) × 12 + (month − nowMonth)`. The day is dropped, so anything dated in the current month is month 0, whether it's the 1st or the 31st, before or after today.

## Monthly engine: amount in month `m`

Let `startOff = monthOffset(start_date)` and `since = m − startOff`. Nothing happens before the start month or after the end month (inclusive).

| Frequency | Amount in an active month |
|---|---|
| weekly | `amount × 52/12` (≈4.33 payments, every month) |
| biweekly | `amount × 26/12` (≈2.17 payments, every month) |
| semimonthly | `amount × 2` (month 0 for income: see below) |
| monthly | `amount` |
| quarterly | `amount` when `since % 3 == 0`, else 0 |
| annually | `amount` when `since % 12 == 0`, else 0 |
| one-time | `amount` when `since == 0`, else 0 |

Weekly and biweekly are **averaged**, so the monthly engine never shows a "3-paycheck month". The day engine does.

**Anchoring differs by entity:**
- **Expenses and future expenses:** anchored to the real start month, even if it's in the past. A quarterly bill that started 5 months ago lands at months 1, 4, 7, …
- **Income:** same, anchored to the real start month even when it's in the past. An annual bonus dated last January lands next January. (Before `75bbb3b` it slid to the current month; see [10 G5](10-known-gaps-and-decisions.md#g5).)
- **Null start date:** anchored to month 0.

**Past one-time items** (start before month 0) never appear.

## Twice-monthly (semimonthly) income

- Paydays are `payday_1` (default 15) and `payday_2` (default 31 = last day). A day past the month's length is clamped to the last day.
- **Weekend rule:** Saturday → Friday before, Sunday → Friday before (−2 days). Applied in the day engine and in the server's scheduled dates. Only twice-monthly income gets this adjustment. Nothing else is shifted for weekends.
- If both paydays resolve to the same date, they're deduplicated into one payment.
- **Month 0 in the monthly engine:** `amount × (2 − number of this month's occurrences whose status ≠ expected)`. Received, detected, and skipped paydays are all removed from the forecast. The reasoning: a received paycheck is already in today's account balance, and a skipped one never arrives.
- **In the day engine:**
  - Skipped paydays are dropped.
  - Received and detected ones stay visible, marked paid, and are counted in the month's totals (it's a history-plus-forecast view).
  - A detected occurrence uses the **actual deposit amount** and date.
  - A moved occurrence uses its `occurrence_date`.
- The UI only lets you edit **current-month** occurrences.

## Funding rules: when a rule is active

`fundingRuleValue(rule, billAmount, m)`: the rule is active only when `startOff ≤ m ≤ endOff` (month-level; null start = always, null end = forever). Then:

- **Fixed rule:** contributes `value` at the rule's own frequency (weekly ×52/12, quarterly every 3rd month from the rule's start, and so on).
- **Percent rule:** contributes `billAmount × min(value, 100)/100`: a percentage of each occurrence of the bill. Its frequency only gates months (quarterly, annually, one-time). Only monthly-or-longer frequencies are offered, and the server normalizes sub-monthly percent rules to monthly ([10 G10](10-known-gaps-and-decisions.md#g10)).
- **A one-time rule** has no end date. The UI clears it on save.
- **Rule window** (`forecast.ts:ruleInWindow`, `monthlyBreakdown.ts:ruleCoversMonth`): `start month ≤ m ≤ end month`, where a one-time rule's window is just its start month. It ignores frequency, so a quarterly rule is "in window" during its off months and contributes 0 then. For **debts**, a month outside every rule's window uses the normal monthly payment ([05](05-funding.md#debt-payments)).

Rule dates are day-precision in the UI but **month-precision in the monthly math**. A rule starting on the 25th of this month is active for all of month 0.

## Day engine specifics (`occurrenceDates`)

- Weekly and biweekly step 7 or 14 days from `start_date`, so a month can hold 4–5 (weekly) or 2–3 (biweekly) occurrences.
- Monthly, quarterly, and annual land on the start date's day-of-month, clamped to month length.
- With no start date, the item is placed on `fallbackDay` (day 1, or the debt's `payment_day`) and marked **"Date not set"** (`dateSpecified: false`).
- Debts with no funding rules get one payment on `payment_day` (or day 1).
- Debts with funding rules: in a month some rule window covers, one event per in-window rule occurrence (the rule's frequency and dates, with `payment_day` as the fallback day). In other months, the normal payment on `payment_day`.
- **Inflation is not applied** in the day engine ([10 G1](10-known-gaps-and-decisions.md#g1)).

## Horizon and windows

- `months` (horizon) is 1–120. `startMonth` hides earlier months from charts but **does not change the math**. Everything is still computed from month 0, so balances at the window start include earlier months.
- The Activity tab computes a horizon of `activityMonth + 1` and shows only that month.
- The Month view (Breakdown → Month) chains months: month N's opening liquidity = month N−1's projected closing liquidity from the day engine.
