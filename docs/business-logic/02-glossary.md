# 02 — Glossary

| Term | Meaning | Where |
|---|---|---|
| **Account** | A pile of cash: checking, savings, or an imported investment account. Has a balance as of *today*. | `accounts` |
| **Primary account** (★) | The one account that pays by default. Unassigned income lands here, and unallocated remainders are paid from here. Exactly one exists whenever any account exists. | `accounts.is_primary` |
| **Total cash** | Sum of all account balances. It is the Savings starting balance. | `App.tsx:totalCash` |
| **Income source** | Recurring or one-off money in. `monthly_amount` is actually **per payment**, despite the name. | `income_sources` |
| **Lump income** | Income with frequency quarterly, annually, or one-time. It lands only in specific months, shown as green bars. | `forecast.ts:LUMP_FREQUENCIES` |
| **Occurrence** (income) | One scheduled payday of a twice-monthly income, which can be overridden: moved to another day in the same month, marked received, or skipped. | `income_occurrences` |
| **Detected** | An occurrence matched to a Plaid deposit at read time. Not stored. | `server/routes/income.js:serialize` |
| **Expense** | An ongoing recurring cost. `monthly_amount` is **per occurrence**. Inflation applies. | `expenses` |
| **Future expense** / **scheduled payment** | A cost with a start date and optional end date, one-off or recurring. Same thing, two names: the UI says "Future Expenses", the DB says `scheduled_payments`. No inflation. | `scheduled_payments` |
| **Debt** | A credit card or loan with a balance, APR, and monthly payment. | `debts` |
| **Credit card** (`credit_card`) | Revolving debt. **Can be charged**, meaning it can fund expenses. May have a `credit_limit`. | `debts.debt_type` |
| **Loan** (`loan`) | Installment debt. **Cannot be charged.** Has no credit limit. | `debts.debt_type` |
| **Funding / "Paid from"** | Which accounts and/or cards pay for an expense, future expense, or debt payment. | [05](05-funding.md) |
| **Allocation** | A simple split: `{source, percent or fixed, value}`, with no dates. | `funding_allocations` |
| **Funding rule** | An allocation plus `frequency`, `start_date`, and `end_date`. If any rules exist, they replace the allocations. | `funding_rules` |
| **Remainder** | The part of a bill no allocation or rule covered. For expenses and future expenses it's paid from the primary account. | [05](05-funding.md) |
| **Charge** | The card-funded portion of a bill. It adds to the card's balance instead of leaving cash, and is repaid through the debt payment. | `debt.ts:DebtCharge` |
| **Charge overflow** / **Invalid funding target** | A charge aimed at a loan or a missing debt. Not paid by anyone, only flagged in the header. | `DebtPlan.chargeOverflow` |
| **Over limit** | A card's month-end balance exceeds its credit limit. Allowed, and flagged. | `DebtPlan.overLimitByDebt` |
| **Strategy** | `none` (each debt pays its own payment), `avalanche` (extra goes to the highest APR first), or `snowball` (extra goes to the smallest balance first). | `app_settings.debt_strategy` |
| **Extra** | Global additional monthly debt budget, used only with avalanche or snowball. | `app_settings.debt_extra` |
| **Rollover** | Under a strategy, a paid-off debt's payment stays in the budget and flows to the next target. | `debt.ts:simulateDebtPlan` |
| **Paid this month** | Flag that this month's debt payment or expense has already happened, so month 0 skips it. Browser-only today. | `App.tsx:paidOverrides` |
| **Autopay day** | `debts.payment_day` (1–31). Drives the default "paid this month" and the day placement in the Month view. | |
| **Horizon** | Number of months forecast (`months`, 1–120), plus a visible window start (`startMonth`). | localStorage `bf.months`, `bf.startMonth` |
| **Month 0** | The current calendar month. | |
| **Scenario** | A named full snapshot of the plan data. It can be compared as an overlay or restored, which replaces all data. | `scenarios` |
| **Group** | A named bucket for income, expenses, or debts, used for display and subtotals only. It has no effect on the math. | `line_item_groups` |
| **Liquidity** | In the Month view: cash in accounts plus available credit on cards that have a limit. The "available to play with" figure. | [08](08-monthly-obligations.md) |
| **Item** (Plaid) | One linked login at one institution. It can contain several accounts. | `plaid_items` |
| **Import** / **Resync** | Import creates app accounts or debts from Plaid accounts. Resync copies fresh Plaid values into already-imported rows. | [09](09-plaid.md) |
