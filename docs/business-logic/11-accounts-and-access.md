# 11 — User accounts and access control

Every row of household data belongs to exactly one user. This doc is the contract for that: how identity works, how tenancy is enforced, and the rules you must not break when adding a route or a table.

## Identity

### `users`
- `email` (as typed) plus `email_normalized` (trimmed + lowercased) — the **unique** key. Sign-up and sign-in both match on the normalized form, so `Alex@Example.com` and `alex@example.com` are one account.
- `password_hash`: scrypt, as `scrypt$N$r$p$salt$key` with a per-user random salt. Chosen over bcrypt/argon2 because it's built into Node, so there's no native dependency to compile. Parameters are the OWASP suggestion (N=2¹⁷, r=8, p=1).
- Minimum password length is **10**; the server caps input at 200 characters because scrypt's cost is paid server-side.

### `sessions`
- The cookie holds a 32-byte random token. The table stores only its **SHA-256 hash**, so a database leak can't be replayed as a login.
- Cookie is `httpOnly`, `SameSite=Lax`, `Secure` in production, 30-day expiry. Expired rows are swept opportunistically on lookup.
- Changing a password **revokes every session** and then re-issues one for the current device.

### Rules
- Login answers **identically** for an unknown email and a wrong password (`401 Incorrect email or password`), so the endpoint can't be used to enumerate accounts.
- Login is throttled per `ip + email`: 10 attempts per 15 minutes. The counter is in-memory, so it resets on restart — fine for one process, **not** sufficient behind multiple workers.
- `req.ip` feeds the throttle, so it must not be spoofable: `trust proxy` is only set when `TRUST_PROXY` is configured.

## What's public

Exactly two things:

| Route | Why |
|---|---|
| `GET /api/health` | Liveness, no data. |
| `/api/auth/*` | Register, login, logout, and `GET /me` (returns `{user: null}` when signed out). |

Everything else sits behind `requireAuth` — mounted as `app.use('/api', requireAuth)` **before** the resource routers in `server/server.js`, so a new router is authenticated by default rather than by remembering to opt in. `PUT /api/auth/password` opts back into `requireAuth` individually.

## Tenancy

`user_id` is on **all 12 data tables**: `accounts`, `income_sources`, `expenses`, `debts`, `line_item_groups`, `scenarios`, `income_occurrences`, `plaid_items`, `plaid_accounts`, `plaid_transactions`, `app_settings`, `paid_status`.

Two of those needed a rebuilt primary key, because their natural key is only unique *per user*:
- `app_settings`: `(key)` → `(user_id, key)`
- `paid_status`: `(entity_type, entity_id, month)` → `(user_id, entity_type, entity_id, month)`

The column is **nullable**, which is what lets a pre-auth database survive: see "Claiming" below. Foreign keys are `ON DELETE CASCADE` to `users`, so deleting a user deletes their data — which means **releasing ownership must happen before deleting a user** if you ever want to keep the rows.

### The rules for queries

1. **Every read and every write is scoped by `user_id`.** No exceptions in route code.
2. **Ownership is checked before mutation.** `PUT`/`DELETE` first `SELECT … WHERE id = ? AND user_id = ?` and return **404** (not 403) when it misses — a user should not learn that someone else's row id exists.
3. Re-reading a row you just inserted (`WHERE id = lastInsertRowid`) or just ownership-checked is fine unscoped.
4. A query whose scoping is only implied by where its parameter came from should **still say `user_id = ?`**. Provenance that has to be traced through three call sites is how a leak gets introduced later.
5. Helpers that touch the DB take `userId` explicitly (`reorder`, `removeFundingAllocations`, `importedSets`, `reattachReplacedCards`, `replacedAccountIds`, `statusPayload`, income's `serialize`). Watch for **fallback lookups** in particular: income's "primary account" fallback would happily have found another tenant's primary account.

### Claiming (pre-auth databases)

The first account registered on a database containing unowned rows **adopts all of them**. This runs inside the same transaction as the user insert, so two concurrent registrations can't both see the data as unowned. Later registrations always start empty.

`db.hasUnownedData()` and `db.claimUnownedData(userId)` in `server/db/database.js`.

### Export, import and scenarios

`user_id` is a tenancy detail, not part of the user's data:
- **Export** strips it (`lib/data.js:withoutUserId`).
- **Import** re-applies the importing user's id, and deletes only *that user's* rows first.

So a snapshot taken from one account restores cleanly into another.

## Plaid

Plaid access tokens are bearer credentials for someone's bank data, so they're **encrypted at rest** with AES-256-GCM (`server/lib/secrets.js`), prefixed `enc.v1.`. The key comes from `APP_SECRET`, or from a gitignored `server/db/secret.key` generated on first boot so local dev needs no setup. Values written before encryption existed still decrypt (returned as-is) and are re-encrypted on the next write. Key rotation is deferred — [ICEBOX I4](../ICEBOX.md).

**`plaid_items` is the root of Plaid ownership**: accounts and transactions inherit `user_id` from their item. Note the split:
- **Read and import paths are user-scoped** (`/accounts`, `/transactions`, `/import_accounts`, `/resync`, `DELETE /items/:id`).
- **Refresh and sync loops iterate a user's items** and are triggered by that user's request. They were global before auth; they must not be again, or one user's page load would spend another user's Plaid quota.

## Tests

`server/lib/isolation.test.mjs` boots the **real server** against a scratch database (`BF_DB_PATH`, and `NODE_ENV=test` to skip demo seeding) and asserts, over HTTP:

- every data route 401s without a session; health stays public
- duplicate email (case-insensitive) → 409; short password → 400
- wrong password → 401; logout invalidates the session
- neither user sees the other's rows in any list route, or in `/export`
- `PUT`/`DELETE` against the other user's row id → 404, **and the row survives**
- settings, scenarios and `paid` are per-user; each user gets their own primary account
- an import by one user doesn't touch the other's data

**Add a case here whenever you add a route.** This file is the only thing standing between a forgotten `WHERE` clause and a cross-tenant leak.
