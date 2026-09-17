# 08 — Monthly Obligations (day-level Month view)

Code: `src/lib/monthlyBreakdown.ts:buildMonthBreakdown`, UI `src/components/MonthlyBreakdown.tsx`. Reached through Breakdown → **Month**. This is the **day-level engine**, which the owner has confirmed is the intended source of truth ([01](01-product-intent.md#direction-owner-confirmed-not-yet-built)).

## What it answers

- **Daily chart:** cumulative money in, money out, and net across the month, with a "Today" marker.
- **Calendar:** each obligation on its actual day. Paid or received items are dimmed and struck through; undated items say "Date not set".
- **Liquidity ("Available to Play With"):** day by day, how much cash plus available card credit you'll have, in total, across cash accounts, per account, or per card.
- **Bank account filter:** limits the daily chart and calendar to movements touching one account (or all cash accounts). Amounts become that account's share.

## Events

Each event is `{day, name, kind: income | expense | future | debt, direction, amount, detail, paid, dateSpecified, liquidityChanges[]}`. Events are sorted by day, then money in before money out, then larger amounts first.

| Kind | Occurrences | Amount | Paid flag | Liquidity changes |
|---|---|---|---|---|
| Income | `incomeOccurrenceDates`: twice-monthly uses paydays + weekend shift + overrides (skipped are dropped); others use `occurrenceDates` | `monthly_amount`, or the **actual deposit** for a detected occurrence | received or detected | +amount to `account_id` or primary |
| Expense | `occurrenceDates(frequency, start, end)` | `monthly_amount` (**no inflation**) | month 0 and marked paid | − per funding split (fixed first, then %, remainder to primary). A card split reduces that card's available credit. |
| Future expense | same | `amount` | never | same, with the legacy source as fallback instead of primary |
| Debt, no rules (or no rule window covers this month) | one per month on `payment_day` (or day 1, "Date not set") | `monthly_payment` | month 0 and marked paid | − from the **first allocation's account**, else `account_id`, else primary (the whole amount, no split). + to the card's available credit if it has a limit. |
| Debt, with a rule window covering this month | one per in-window rule occurrence, dated by the rule's frequency and dates, falling back to `payment_day` | fixed `value`, or `monthly_payment × %` | month 0 and marked paid | − from the rule's account, + to the card |

Only `credit_card` debts **with a `credit_limit`** appear in liquidity. Loans and cards without a limit have no available-credit line.

## Differences from the monthly engine (all known; see [10 G1](10-known-gaps-and-decisions.md#g1))

- Real dates: weekly and biweekly produce 4–5 or 2–3 events rather than a ×52/12 average.
- No inflation.
- **No debt simulation:** no interest, no avalanche/snowball or extra, no payoff (payments continue even after a debt would be paid off), no charges accumulating on card balances.
- Debt payments without rules aren't split across multiple allocations.
- Paid items **stay in totals** here (it's history plus forecast), but are removed from monthly-engine month 0.

## Liquidity math

- **Starting value per source:**
  - Account: `balance`.
  - Card: `limit − balance` (negative when over limit).
- **Month 0:** the opening value is *reconstructed*: `today's value − Σ changes from events dated ≤ today`. Then every event in the month is replayed. So a paycheck dated before today isn't added twice.
  - Caveat: this assumes every event dated ≤ today actually happened, whether or not it's flagged paid.
- **Month N > 0** (the Month control advanced): App builds month 0, then each following month, passing the previous month's closing value per source as the opening value (`liquidityStart`).
- Each day's value is capped at `max`: accounts have no cap, cards are capped at their limit. **There is no floor**, so a projected overdraft or over-limit card shows negative ([10 G12](10-known-gaps-and-decisions.md#g12)).
- `total` = Σ accounts + Σ cards. `accounts` = Σ accounts.

## Tests

`src/lib/monthlyBreakdown.test.ts` covers:
- received vs expected twice-monthly deposits,
- the weekend payday shift,
- day placement and the cumulative line,
- per-rule debt events, and the normal payment outside rule windows,
- "Date not set",
- liquidity by source, including negative (overdraft) values.
