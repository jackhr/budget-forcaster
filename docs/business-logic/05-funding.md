# 05 — Funding: who pays for what

Every outflow answers "paid from where?". Sources are **accounts** (cash leaves) or **credit cards** (a charge is added to the card). Funding applies to three things, and the rules differ slightly for each:

| | Expenses | Future expenses | Debt payments |
|---|---|---|---|
| Card sources allowed | yes | yes | **no** (accounts only) |
| Uncovered remainder | primary account | primary account | depends; see [Debt payments](#debt-payments) |
| Rules change the *amount* paid | no, only routing | no, only routing | **yes**, rules set the payment |
| Legacy fallback | none (primary) | `funding_source_type/id` | `account_id` → primary |
| Engine | `buildExpensePlan` | `paymentFundingAtAmount`, `buildDebtCharges`, `buildScheduledOutByAccount` | `buildDebtPaymentSchedule`, `debtPaymentByAccount` |

## Shapes

```ts
Allocation  = { source_type: 'account' | 'debt', source_id, alloc_type: 'percent' | 'fixed', value }
FundingRule = Allocation & { frequency, start_date, end_date }
```

Server-side validation (`server/lib/funding.js`) silently **drops** malformed entries: bad source type, bad alloc type, non-finite or negative value. Debts reject card sources (`allowDebt: false`), and debt routes reject percent rules over 100 with a 400.

## Precedence

1. If `funding_rules` is non-empty → **only rules** are used, and allocations are ignored.
2. Else if `funding_allocations` is non-empty → allocations.
3. Else → legacy or default (primary account for expenses; legacy source for future expenses; `account_id` or primary for debts).

## Resolving one bill of amount `A` (expenses and future expenses)

`paymentFundingFromSources` in `forecast.ts`:

1. `remaining = A`.
2. **Fixed** entries first, in array order. Each takes `min(value, remaining)`. (For rules, the value comes from `fundingRuleValue`, so inactive-window rules contribute 0.)
3. Then **percent** entries: each takes `min(A × pct/100, remaining)`. **The percent is of the full bill, not of what's left.**
4. Whatever is left is **cash from the primary account**.

Example: a $1,000 bill with `[{card X, fixed 300}, {Savings, percent 50}]` → card X is charged $300, Savings pays $500, and primary pays the $200 remainder.

Consequences:
- Percentages over 100% in total, or fixed amounts over the bill, are silently capped by `remaining`. Nothing is paid twice.
- Card portions become `DebtCharge { debtId, monthIndex, amount, label, kind: 'expense' | 'future' }` and feed `simulateDebtPlan`. **They are not cash out.**
- Account portions for a known account are cash out of that account.
- A portion pointing at a deleted account falls into the remainder (primary).
- A card portion pointing at a deleted debt: for **expenses** it silently vanishes ([10 G7](10-known-gaps-and-decisions.md#g7)); for **future expenses** it becomes charge overflow, the header's "Invalid funding target".
- A card portion pointing at a **loan** → charge overflow (flagged, paid by nobody).

## Credit cards as funding sources

- Only `debt_type = 'credit_card'` appears in "Paid from" pickers.
- The UI shows **available credit** (`limit − balance`) as of today and warns when a charge would exceed it. It **never blocks or clamps**.
- In the simulation, a valid card **accepts the whole charge even past its limit**. The first month the month-end balance (after payment) is over the limit is recorded in `overLimitByDebt` and shown as a badge. This is the settled rule; see [10 Decisions](10-known-gaps-and-decisions.md#decisions).
- Charges on a paid-off card reactivate it: the payoff month resets and payments resume.

## Debt payments

"Who pays the Amex payment, and how much?"

### Amount (`buildDebtPaymentSchedule`)

- **No rules:** the payment is `monthly_payment`, possibly changed by the strategy ([06](06-debt.md)). Allocations and `account_id` only decide which account pays, never how much.
- **Rules exist (current):** for every month, payment = the sum of the active rules' values.
  - Fixed rules add `value` at their frequency.
  - Percent rules add `monthly_payment × pct/100` (each capped at 100%; separate rules may stack past 100%).
  - **A month with no active rule pays $0.** The debt also opts out of avalanche/snowball rollover that month.
- **Intended (owner-confirmed):** rules are **temporary overrides**. Outside every rule's window, the debt should revert to `monthly_payment` from its default account. See [10 G3](10-known-gaps-and-decisions.md#g3). Commit `b1dbfe1` deliberately made the current "authoritative" behavior, but the owner has since clarified the intent.

### Routing (`debtPaymentByAccount`)

Given the actual payment `P` for a month (after strategy):

- **Rules exist:** fixed rules then percent rules are attributed to their accounts, each capped at what's left of `P`. **No remainder goes to primary.** (`P` never exceeds the rules' total, because rule-driven debts don't receive rollover. It can be less, when the balance is nearly paid off.)
- **Allocations exist:** fixed then percent of `P`, and the **remainder goes to primary**.
- **Neither:** all of `P` from `account_id` if it's a valid account, else primary.

Payments to unknown accounts are dropped from per-account views. Total debt outflow (`plan.outflow`) still counts them, which reduces total cash.

## The simple "Paid from" dropdown vs the funding plan

Editors store a single-source choice as **one allocation at 100%**: `[{source, percent, 100}]`. The editor goes into "advanced" mode (shows the plan summary and "Edit funding plan") when there are rules, more than one allocation, or any allocation that isn't 100%. "Use one source/account" clears both arrays, which means primary.

The funding modal edits **rules only**. Opening it on a legacy allocation converts the allocations into monthly rules with no dates, and saving replaces them with rules.

Helper text in the modal reflects the difference: for expenses and future expenses, "any unallocated remainder is paid from the primary account". For debts, "these rules are the complete payment plan… months without an active rule make no payment". That second message should change when G3 is fixed.

## Invariants when changing funding code

- Keep `buildExpensePlan`, `buildDebtCharges`/`paymentFundingAtAmount`, `buildScheduledOutByAccount`, `buildAccountActivity`, and `monthlyBreakdown.fundingChanges` resolving splits **identically**. Fixed before percent, percent of the full amount, remainder to primary.
- Anything card-funded must appear as a charge in the debt plan and **never** as cash out.
- Re-check [07's invariants](07-forecast-pipeline.md#invariants) (forecast net = savings delta; accounts sum = total).
