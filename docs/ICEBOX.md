# Icebox

Things we've decided we want, deliberately **not** building yet. Each entry says what it is, why it's deferred, and what in the current code would have to change. Promote an item by moving it into a plan and deleting it here.

This is not a bug list — confirmed bugs and gaps live in [business-logic/10-known-gaps-and-decisions.md](business-logic/10-known-gaps-and-decisions.md).

---

## I1: Pluggable database driver

**What:** a Laravel-style data layer where the storage engine is a config choice — SQLite for local dev, Postgres (or MySQL) for a hosted deployment — without rewriting route code.

**Why deferred:** SQLite is genuinely the right call while this runs on one machine, and `better-sqlite3`'s synchronous API is a large part of why the route code is so short. Abstracting now would cost that simplicity before anything needs it.

**What has to change:**
- Every route calls `db.prepare(...).run()/get()/all()` directly and synchronously. A Postgres driver is async, so the abstraction has to be async *everywhere*, which means touching every route handler and `server/lib/data.js`.
- SQL in the routes is mostly portable, but not all of it: `datetime('now')`, `date('now')`, `INTEGER PRIMARY KEY AUTOINCREMENT`, `PRAGMA table_info` migration guards, and `ON CONFLICT ... DO UPDATE` all need dialect handling.
- Migrations are currently imperative statements that run on boot (`server/db/database.js`). A real driver story needs versioned, ordered migration files instead.
- `lib/data.js:TABLES` drives export/import and scenarios by iterating tables and columns generically — that part ports cleanly.

**Suggested shape:** a thin repository layer (`server/db/driver/*.js`) exposing the handful of operations the routes actually use, chosen by a `DB_DRIVER` env var. Don't build a general query builder.

---

## I2: Goal suggestions engine

**What:** the user describes a goal ("pay off the cards", "$25k emergency fund by mid-2028") and the app proposes concrete ways to reach it from their actual numbers — raise this payment, cut this expense, reorder the payoff strategy, move this bill off the card.

**Why deferred:** goals themselves have now shipped — `goals` table, `/api/goals`, a Plan page, and the `goal` home layout. What exists says *where you stand* and *when the current plan gets you there*; it proposes nothing. Suggestions are a different and much harder problem: an optimization over the forecast, where a wrong suggestion in a money app is worse than none.

**Starting point:** `src/lib/goals.ts:goalProgress` already computes the projected month for a candidate plan. A suggestion engine re-runs it under modified inputs and ranks the results.

**What has to change:**
- Needs a *search* over the forecast, not a single projection: re-run `buildForecast`/`simulateDebtPlan` under candidate changes and rank the results. The engine is pure and takes `now`, so this is feasible, but it has to stay fast enough to run on every render or move off the render path.
- Needs a notion of which levers the user considers movable. Cutting an expense is not equivalent to raising income; the app can't tell which is realistic without being told.
- Should reuse the existing scenario snapshot machinery (`scenarios` table, `App.tsx:scenarioSeries`) rather than inventing a second compare path.

**Assume:** anyone opening a budgeting app already has a loose goal in mind. The app should not demand a formal goal before being useful.

---

## I3: Onboarding journey

**What:** a first-run flow that shows a new user the available home-screen layouts (Runway & safety / Goal progress / Balance sheet) and lets them pick, rather than silently defaulting.

**Why deferred:** likely overkill, and it's the wrong thing to design before the layouts themselves have settled. **Runway & safety is the default**; the choice is a setting from day one, so nothing blocks adding a picker later.

**Done since:** the preference is a server-side per-user setting (`app_settings.home_layout`), with an in-page picker on Home. Two layouts exist — `runway` and `balance`. Adding one means an entry in `src/lib/homeLayout.ts`, the matching id in `server/lib/settings.js`, and a branch in `Home.tsx`.

**What has to change:**
- There are now five home layouts, so a first-run picker has something to choose between. What's still missing is the "have you finished setting up?" signal below.
- An onboarding flow also wants a "have you finished setting up?" signal: an account, some income, some expenses. That state doesn't exist today.

**Open question:** whether onboarding should instead be about *getting data in* (connect a bank, add your income) rather than about choosing a view. Connecting Plaid first would populate every layout and make the choice obvious.

---

## I4: Encrypted Plaid tokens — key management

**What:** proper key management for the Plaid access-token encryption (rotation, a KMS or at minimum a key loaded from the environment rather than derived from one long-lived secret).

**Why deferred:** encrypting at rest with an env-provided key closes the immediate "plaintext tokens in a shared DB" hole. Rotation and KMS are deployment concerns that only matter once this is actually hosted.

**What has to change:** a key-version column alongside the ciphertext so old rows stay readable through a rotation.
