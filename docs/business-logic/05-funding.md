# 05 — Funding: who pays for what

Every outflow answers "paid from where?". Sources are **accounts** (cash leaves) or **credit cards** (a charge is added to the card). Funding applies to three things, and the rules differ slightly for each:

| | Expenses | Future expenses | Debt payments |
|---|---|---|---|
| Card sources allowed | yes | yes | **no** (accounts only) |
| Uncovered remainder | primary account | primary account | depends; see [Debt payments](#debt-payments) |
| Rules change the *amount* paid | no, only routing | no, only routing | **yes**, in months their date window covers |
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
- A card portion pointing at a deleted debt becomes charge overflow, the header's "Invalid funding target". This applies to expenses and future expenses alike ([10 G7](10-known-gaps-and-decisions.md#g7)).
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
- **Rules are temporary overrides.** In a month that at least one rule's **date window** covers ([04](04-scheduling.md#funding-rules-when-a-rule-is-active)), payment = the sum of the in-window rules' values:
  - Fixed rules add `value` at their frequency (0 in off months).
  - Percent rules add `monthly_payment × pct/100` (each capped at 100%; separate rules may stack past 100%).
  - That month the debt pays exactly this amount and opts out of avalanche/snowball rollover.
- **In a month no rule window covers**, the schedule entry is `null`: the debt pays `monthly_payment` like a debt without rules, and takes part in the strategy.
- Example: $300 normal payment, plus a rule "$500/mo from Savings, Oct → Dec". Oct–Dec pay $500 from Savings; January onward pays $300 from the default account. ([10 G3](10-known-gaps-and-decisions.md#g3) has the history.)

### Routing (`debtPaymentByAccount`)

Given the actual payment `P` for a month (after strategy):

- **In-window rules exist this month:** fixed rules then percent rules are attributed to their accounts, each capped at what's left of `P`. **No remainder goes to primary.** (`P` never exceeds the rules' total, because rule-driven debts don't receive rollover. It can be less, when the balance is nearly paid off.)
- **Otherwise, allocations exist:** fixed then percent of `P`, and the **remainder goes to primary**.
- **Otherwise:** all of `P` from `account_id` if it's a valid account, else primary.

Payments to unknown accounts are dropped from per-account views. Total debt outflow (`plan.outflow`) still counts them, which reduces total cash.

## The simple "Paid from" dropdown vs the funding plan

Editors store a single-source choice as **one allocation at 100%**: `[{source, percent, 100}]`. The editor goes into "advanced" mode (shows the plan summary and "Edit funding plan") when there are rules, more than one allocation, or any allocation that isn't 100%. "Use one source/account" clears both arrays, which means primary.

The funding modal edits **rules only**. Opening it on a legacy allocation converts the allocations into monthly rules with no dates, and saving replaces them with rules.

Helper text in the modal reflects the difference: for expenses and future expenses, "any unallocated remainder is paid from the primary account". For debts, rules "override the debt's monthly payment while their dates are active… Outside every rule's dates, the normal monthly payment is made from the debt's default account". Percent rules only offer monthly, quarterly, annual, and one-time frequencies.

## Invariants when changing funding code

- Keep `buildExpensePlan`, `buildDebtCharges`/`paymentFundingAtAmount`, `buildScheduledOutByAccount`, `buildAccountActivity`, and `monthlyBreakdown.fundingChanges` resolving splits **identically**. Fixed before percent, percent of the full amount, remainder to primary.
- Anything card-funded must appear as a charge in the debt plan and **never** as cash out.
- Re-check [07's invariants](07-forecast-pipeline.md#invariants) (forecast net = savings delta; accounts sum = total).
