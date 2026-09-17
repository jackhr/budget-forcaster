# Business logic docs (for AI agents and contributors)

These docs explain **what the app is supposed to do and why**: the money rules, the invariants, and the decisions behind them. [CLAUDE.md](../../CLAUDE.md) is the architecture map (files, routes, commands). Read CLAUDE.md for *where* code lives, and these docs for *what the code must preserve*.

## Reading order

| # | File | Read it when… |
|---|------|---------------|
| 1 | [01-product-intent.md](01-product-intent.md) | Always, first. Purpose, audience, principles, direction. |
| 2 | [02-glossary.md](02-glossary.md) | You hit a domain term (primary account, charge, lump, occurrence…). |
| 3 | [03-entities.md](03-entities.md) | You touch any table, route, or type. Meaning, defaults, invariants, delete behavior. |
| 4 | [04-scheduling.md](04-scheduling.md) | Anything involving frequencies, dates, paydays, or "which month does this land in". |
| 5 | [05-funding.md](05-funding.md) | Anything about *who pays* for an expense, future expense, or debt payment. |
| 6 | [06-debt.md](06-debt.md) | Payoff simulation, strategies, charges, credit limits, "paid this month". |
| 7 | [07-forecast-pipeline.md](07-forecast-pipeline.md) | Changing any chart/tab, or any number that feeds one. |
| 8 | [08-monthly-obligations.md](08-monthly-obligations.md) | The day-level Month view: calendar, daily chart, liquidity. |
| 9 | [09-plaid.md](09-plaid.md) | Bank linking, import, resync, transactions, income detection. |
| 10 | [10-known-gaps-and-decisions.md](10-known-gaps-and-decisions.md) | **Before changing behavior.** Confirmed bugs, intended-vs-current gaps, settled decisions. |

## Conventions in these docs

- **Current** means what the code does today. **Intended** means what the owner has confirmed it *should* do. When they differ, the gap is listed in doc 10, and the topic doc links to it.
- Code references use `path:symbol` so they survive line shifts, e.g. `src/lib/debt.ts:simulateDebtPlan`.
- Examples use made-up names and amounts. **The GitHub repo is public: never put real household data (names, account masks, balances, lenders) in these docs or in commits.**
- "Month 0" means the current calendar month. Forecast arrays are indexed by month offset from today.

## Keeping these docs true

If you change a rule described here, update the doc in the same commit. If you fix an item in doc 10, move it to the "Resolved" section with the commit hash.
