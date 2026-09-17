# 06 — Debt: payoff simulation, strategies, charges, limits

Code: `src/lib/debt.ts`. Two simulators serve different purposes.

## `simulateDebt`: per-row summary (independent, simple)

Used for each debt row's "Paid off <date> · N mo · $X interest" and the editor preview. **It ignores charges, funding rules, strategy, extra, and paid-this-month.** It answers "this debt on its own at its monthly payment".

Each month: add interest (`balance × apr/1200`), then pay `min(payment, balance)`. Stops when balance ≤ $0.005, with a 1,200-month cap.

**Never-pays-off guard:** if `payment ≤ 0`, or `apr > 0` and `payment ≤ first month's interest`, the result is `neverPaysOff`, with no loop. The UI says "Payment won't cover interest — never pays off". Keep this guard in any new amortization code.

## `simulateDebtPlan`: the real plan (feeds every chart)

```ts
simulateDebtPlan(debts, extra, strategy, months, charges, paymentSchedule?, paidThisMonth?)
  → { outflow, outflowByDebt, remaining, remainingByDebt, interestByDebt,
      payoffMonthByDebt, overLimitByDebt, chargeOverflow, totalInterest, debtFreeMonthIndex }
```

### Monthly order of operations (this order matters)

1. **Interest** accrues on every debt with a balance > $0.005, *before* charges and payments.
2. **Charges** for this month are applied:
   - Target is a card (not a loan) → balance += charge, **with no limit check**. If the card was paid off, it reactivates.
   - Target is a loan or unknown → `chargeOverflow[m] += amount`. The balance doesn't change and nobody pays it.
3. **Payments** by strategy:
   - **`none`:** each debt pays `min(minOf(d), balance)`, where `minOf` = 0 in month 0 if paid this month, else the scheduled override, else `monthly_payment`. `extra` is ignored (App also passes 0).
   - **`avalanche` / `snowball`:**
     - `budget = Σ monthly_payment of debts without an override this month and not paid this month (including already-paid-off debts) + extra`. Because paid-off debts still count, their payment **rolls over** to the others and the total monthly debt budget stays constant.
     - A debt **paid this month** (month 0 only) pays nothing, adds nothing to the budget, and isn't a target for the leftover.
     - Debts **with an override** (a funding rule window covers the month) pay exactly `min(override, balance)` from outside the budget.
     - Other debts pay `min(monthly_payment, balance, budget)` in list order (sort order).
     - The leftover budget goes to target debts, sorted by **highest APR** (avalanche) or **smallest current balance** (snowball), each taking `min(budget, balance)`.
4. **Record:** over-limit check on the post-payment balance (cards with a limit only; first month only), payoff month, remaining balances, and rounding.

`debtFreeMonthIndex` is the first month every debt is ≤ $0.005 (−1 if already debt-free).

### Where the plan is used (App.tsx)

| Plan | Args | Used for |
|---|---|---|
| `plan` | user strategy + extra, all charges, schedule, paid set | Forecast, Savings, Net Worth, Overview, Outflows, Debt breakdown, payoff markers, over-limit badges, invalid-target banner |
| `basePlan` | `none`, extra 0, same charges, schedule, and paid set | "saves $X · N mo sooner" in the Debts header (`basePlan.totalInterest − plan.totalInterest`) |
| no-future plan | like `plan` but only expense charges | Breakdown → Accounts with "Include future expenses" off |
| activity plan | horizon = selected month + 1, **no paid set** | Activity tab |
| scenario plan | from the snapshot, no paid set | Compare overlay |

## Charges

A charge is a card-funded portion of an expense or future expense (see [05](05-funding.md)). Built by `buildExpensePlan(...).charges` and `buildDebtCharges(payments)`, and concatenated before simulation. Each carries a `label` and `kind` so the Debt Breakdown tooltip and Debt Activity can itemize what was billed to the card.

## Credit limits (settled rule)

- Cards absorb every charge, even past the limit. The app **flags, never caps, and never spills to cash**.
- **Currently over:** `balance > credit_limit` today, shown with a badge.
- **Forecast over:** `overLimitByDebt` shows a badge "Over limit <Mon YYYY>", with a count on the group and section headers.
- The Debt Breakdown can draw dashed limit lines per card.
- Available credit shown in pickers is **today's** `limit − balance`. It doesn't account for future charges.

## "Paid this month"

Purpose: account balances are as-of-today, but month 0 would otherwise subtract the whole month's payment. If the payment already cleared, it's already reflected in the balances, so skip it.

- **Precedence for debts:**
  1. A manual override for this month (`paid_status`).
  2. Plaid detection, for linked debts ([09](09-plaid.md#debt-payment-detection)).
  3. The autopay-day default: paid if `payment_day ≤ today's day-of-month`, unpaid if there's no autopay day or it's still upcoming (`debtPaidDefault`).
- **Expenses:** a manual override, else unpaid.
- The debt row's paid button tooltip says which source decided it.
- Overrides are keyed by month, so a new month starts from the defaults again.
- **Effects when paid:**
  - Debt: no month-0 payment under any strategy, and the balance is unchanged in month 0.
  - Expense: no month-0 cash or charge.
  - Activity and the Month view still list the item, marked paid. Activity excludes it from totals; the Month view includes it (history + forecast).
- **Still open:** auto-detecting paid expenses ([10 G4](10-known-gaps-and-decisions.md#g4)).

## Net worth

`netWorth[m] = savings.balance[m] − plan.remaining[m]`. There's no separate asset class: imported investment accounts count as cash, and home equity isn't modeled.

## Debt Activity (Activity tab → a debt)

- **In** (grows the balance): charges grouped by source name, plus interest.
- **Out** (pays it down): payments, one row per funding account ("from Checking"). If no valid account funds it, a single "Funding account not set" row.
