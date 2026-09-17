# 07 — Forecast pipeline: how every number is derived

Everything is recomputed on each render in `src/App.tsx` from the loaded state. Nothing derived is stored. All functions are pure (`src/lib/*`) and take `now` for testability.

## Pipeline (in order)

```
accounts ─┐
          ├─ totalCash = Σ balance
expenses ─┼─ buildExpensePlan(expenses, accounts, months, inflation, now, paidExpenses)
          │     → ongoingCashOut[m], outByAccount, charges(kind:'expense')
payments ─┼─ buildDebtCharges(payments) → charges(kind:'future')
debts ────┼─ buildDebtPaymentSchedule(debts) → per-debt override[m] | null
          ├─ simulateDebtPlan(debts, extra, strategy, months, allCharges, schedule, paidDebts) → plan
          │     debtCashOut[m] = plan.outflow[m]
income ───┼─ buildForecast(income, ongoingCashOut, payments, debtCashOut)  → Forecast tab
          ├─ buildSavings(…same…, totalCash)                               → Savings tab
          ├─ buildNetWorth(savings, plan.remaining)                         → Net Worth tab
          ├─ buildScheduledOutByAccount(payments, accounts)
          ├─ buildDebtOutByAccount(debts, plan, accounts)
          └─ buildAccountSeries / buildAccountSavings / buildAccountActivity / buildDebtActivity
```

## One month's cash math (`cashflowAtMonth` + callers)

```
income[m]       = Σ incomeCashAtMonth(source, m)                         // see 04
ongoing[m]      = expensePlan.ongoingCashOut[m]                           // inflated, cash portions only
scheduledOut[m] = Σ future expense cash portions (account parts + remainder; card parts excluded)
debtOut[m]      = plan.outflow[m]
net[m]          = income − ongoing − scheduledOut − debtOut
balance[m]      = totalCash + Σ_{k≤m} net[k]
```

Inflation: `expense × (1 + rate/100)^(m/12)`. It applies to **expenses only**: not future expenses, income, or debt payments.

## Invariants

These are tested. Don't break them:

1. **Forecast net[m] == Savings net[m]** (and therefore == balance[m] − balance[m−1]). Both call `cashflowAtMonth` with the same inputs.
2. **Σ per-account balances == total savings balance**, *provided* every income, funding, and debt route resolves to an existing account. Income goes to its account or primary. Each account bears its expense, future-expense, and debt-payment cash.
3. **A card-funded amount is never cash out.** It shows up as a charge, then as debt payments.
4. **Forecast "expenses" = ongoing + scheduledOut + debtOut.** That is total cash out, including debt payments.

## Month 0 semantics

Starting balances are **today's**, but month 0 applies the **whole calendar month's** flows. Anything that has already happened this month would be counted twice (already in the balance, and subtracted again) unless it's flagged:

- Debts and expenses → **paid this month** (manual, or Plaid-detected for debts)
- Twice-monthly income → **received / skipped / detected** occurrences

Weekly, biweekly, monthly, and lump income have **no** such adjustment, so a paycheck that already landed this month is counted again in month 0. This is part of why the day-level engine is the intended source of truth. The Month view instead reconstructs the month's opening balance by reversing events dated on or before today.

## Tabs → data

| Tab | Data | Notes |
|---|---|---|
| **Forecast** | `buildForecast` | Summary cards + income/expense/net chart. Compare overlay = scenario net. |
| **Savings** | `buildSavings` or `buildAccountSavings(accountId)` | All accounts or one account. Lump-income bars, future-expense bars, payoff markers (single-account view: only debts whose `account_id`/primary is that account). |
| **Net Worth** | `buildNetWorth` | Payoff markers. |
| **Breakdown → Range** | Accounts: `buildAccountSeries` (optionally recomputed with no future expenses). Income, Expense, Future: `build*Breakdown`. Debts: `plan.remainingByDebt`. | Debts: limit lines, per-month charge/payment tooltip, legend grouped by debt group. Future bars use the **full** amount, card-funded included. |
| **Breakdown → Month** | `buildMonthBreakdown` chained month by month | See [08](08-monthly-obligations.md). |
| **Overview** | income, expenses (ongoing only), future total (full amount), cash balance, debt remaining | |
| **Activity** | `buildAccountActivity` / `buildDebtActivity` for one month | Per-item in/out with a funding detail string. Paid items are shown but excluded from totals. |
| **Outflows** | `expensePlan.outByAccount` + `scheduledOutByAccount` + `debtOutByAccount` | Stacked by account per month; list view with a category split. |
| **Transactions** | Plaid cache, not the forecast | See [09](09-plaid.md). |

"This month out" strip (all tabs except Transactions): month-0 expenses, future expenses, and debt payments, plus net.

## View state (not data)

Stored in localStorage under `bf.*`: tab, horizon, window start, breakdown section, mode, month, include-future flag, activity month, and collapsed sections and groups. These are pure view preferences. Anything that changes *numbers* belongs on the server ("paid this month" moved there in `75bbb3b`).

## Scenario compare

`App.tsx:scenarioSeries` re-runs a **reduced** pipeline on a snapshot: no paid-this-month and no income occurrences (snapshots store them, but the compare pipeline doesn't apply them). If the snapshot has no accounts, it falls back to legacy `starting_balance`. The overlay is net, savings, and net worth only. Small month-0 differences from the live view are expected.
