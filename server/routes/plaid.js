const express = require('express');
const router = express.Router();
const db = require('../db/database');
const { getClient, isConfigured, PLAID_ENV } = require('../lib/plaid');

function requireClient(res) {
  const client = getClient();
  if (!client) {
    const secretVar = PLAID_ENV === 'production' ? 'PLAID_PROD_SECRET' : 'PLAID_SANDBOX_SECRET';
    res.status(503).json({ error: `Plaid is not configured for the '${PLAID_ENV}' environment. Set PLAID_CLIENT_ID and ${secretVar} in .env, then restart the server.` });
    return null;
  }
  return client;
}

// Whether Plaid is configured + which institutions are linked (no secrets exposed).
router.get('/status', (req, res) => {
  const items = db.prepare('SELECT id, item_id, institution_name, created_at FROM plaid_items ORDER BY created_at ASC').all();
  res.json({ configured: isConfigured(), env: PLAID_ENV, items });
});

// Create a link_token to open Plaid Link on the client.
router.post('/create_link_token', async (req, res) => {
  const client = requireClient(res);
  if (!client) return;
  try {
    const resp = await client.linkTokenCreate({
      user: { client_user_id: 'local-user' },
      client_name: 'Budget Forecaster',
      products: ['transactions'],
      country_codes: ['US'],
      language: 'en',
    });
    res.json({ link_token: resp.data.link_token });
  } catch (e) {
    res.status(502).json({ error: plaidError(e) });
  }
});

// Exchange a public_token (from Link) for an access_token; store the item.
router.post('/exchange_public_token', async (req, res) => {
  const client = requireClient(res);
  if (!client) return;
  const { public_token } = req.body;
  if (!public_token) return res.status(400).json({ error: 'public_token is required' });
  try {
    const exchange = await client.itemPublicTokenExchange({ public_token });
    const access_token = exchange.data.access_token;
    const item_id = exchange.data.item_id;

    let institution_name = null;
    try {
      const item = await client.itemGet({ access_token });
      const instId = item.data.item.institution_id;
      if (instId) {
        const inst = await client.institutionsGetById({ institution_id: instId, country_codes: ['US'] });
        institution_name = inst.data.institution.name;
      }
    } catch { /* institution lookup is best-effort */ }

    db.prepare(
      `INSERT INTO plaid_items (item_id, access_token, institution_name) VALUES (?, ?, ?)
       ON CONFLICT(item_id) DO UPDATE SET access_token = excluded.access_token, institution_name = excluded.institution_name`
    ).run(item_id, access_token, institution_name);

    res.json({ ok: true, item_id, institution_name });
  } catch (e) {
    res.status(502).json({ error: plaidError(e) });
  }
});

// Account balances are cached and refreshed from Plaid at most every 5 minutes,
// in the background — the request serves the cache and never blocks on Plaid
// (except the very first time, when there's nothing cached yet).
const ACCOUNTS_TTL_MS = 5 * 60 * 1000;

const upsertAccount = db.prepare(`
  INSERT INTO plaid_accounts
    (account_id, item_id, institution_name, name, official_name, mask, type, subtype, current, available, credit_limit, currency, updated_at)
  VALUES (@account_id, @item_id, @institution_name, @name, @official_name, @mask, @type, @subtype, @current, @available, @credit_limit, @currency, datetime('now'))
  ON CONFLICT(account_id) DO UPDATE SET
    item_id = excluded.item_id, institution_name = excluded.institution_name, name = excluded.name,
    official_name = excluded.official_name, mask = excluded.mask, type = excluded.type, subtype = excluded.subtype,
    current = excluded.current, available = excluded.available, credit_limit = excluded.credit_limit,
    currency = excluded.currency, updated_at = datetime('now')
`);

function serializeAccount(r, imported = false) {
  return {
    item_id: r.item_id,
    institution_name: r.institution_name,
    account_id: r.account_id,
    name: r.name,
    official_name: r.official_name,
    mask: r.mask,
    type: r.type,
    subtype: r.subtype,
    current: r.current,
    available: r.available,
    limit: r.credit_limit,
    currency: r.currency,
    imported,
  };
}

// The local name we give an imported row, matching the client's import label.
function importName(name, mask) {
  return `${name || 'Account'}${mask ? ` ••${mask}` : ''}`.slice(0, 60);
}

// Sets of what's already imported: by Plaid account id (exact link) and by the
// local row name (covers rows imported before the link column existed).
function importedSets() {
  const rows = [
    ...db.prepare('SELECT plaid_account_id, name FROM accounts').all(),
    ...db.prepare('SELECT plaid_account_id, name FROM debts').all(),
  ];
  return {
    byId: new Set(rows.map((r) => r.plaid_account_id).filter(Boolean)),
    byName: new Set(rows.map((r) => r.name)),
  };
}

// Cache is stale if any linked item has never synced or is older than the TTL.
function accountsStale() {
  const items = db.prepare('SELECT accounts_synced_at FROM plaid_items').all();
  if (items.length === 0) return false;
  const now = Date.now();
  return items.some((it) => {
    if (!it.accounts_synced_at) return true;
    const t = new Date(it.accounts_synced_at.replace(' ', 'T') + 'Z').getTime();
    return now - t > ACCOUNTS_TTL_MS;
  });
}

let accountsRefreshing = false;
async function refreshAccountsCache(client) {
  if (accountsRefreshing) return; // collapse concurrent refreshes
  accountsRefreshing = true;
  try {
    const items = db.prepare('SELECT * FROM plaid_items').all();
    for (const item of items) {
      const resp = await client.accountsBalanceGet({ access_token: item.access_token });
      const apply = db.transaction(() => {
        // Replace this item's rows so removed accounts drop out of the cache.
        db.prepare('DELETE FROM plaid_accounts WHERE item_id = ?').run(item.item_id);
        for (const a of resp.data.accounts) {
          upsertAccount.run({
            account_id: a.account_id,
            item_id: item.item_id,
            institution_name: item.institution_name,
            name: a.name,
            official_name: a.official_name ?? null,
            mask: a.mask ?? null,
            type: a.type ?? null,
            subtype: a.subtype ?? null,
            current: a.balances.current ?? null,
            available: a.balances.available ?? null,
            credit_limit: a.balances.limit ?? null,
            currency: a.balances.iso_currency_code ?? null,
          });
        }
      });
      apply();
      db.prepare("UPDATE plaid_items SET accounts_synced_at = datetime('now') WHERE id = ?").run(item.id);
    }
  } catch (e) {
    console.error('Plaid accounts refresh failed:', plaidError(e));
  } finally {
    accountsRefreshing = false;
  }
}

router.get('/accounts', async (req, res) => {
  try {
    const client = getClient();
    const cached = db.prepare('SELECT COUNT(*) AS c FROM plaid_accounts').get().c;
    if (client) {
      if (cached === 0) {
        await refreshAccountsCache(client); // nothing to show yet — populate once
      } else if (accountsStale()) {
        refreshAccountsCache(client); // serve cache now, refresh in the background
      }
    }
    const rows = db.prepare('SELECT * FROM plaid_accounts ORDER BY type, name').all();
    const { byId, byName } = importedSets();
    const isImported = (pa) => byId.has(pa.account_id) || byName.has(importName(pa.name, pa.mask));
    res.json(rows.map((r) => serializeAccount(r, isImported(r))));
  } catch (e) {
    res.status(502).json({ error: plaidError(e) });
  }
});

// Past transactions for a single linked account (or all accounts if none given).
// Transactions are cached in SQLite and kept current with /transactions/sync
// (cursor-based deltas), so the page loads instantly from cache and only the
// first sync (or an explicit refresh) hits Plaid.
const upsertTxn = db.prepare(`
  INSERT INTO plaid_transactions
    (transaction_id, item_id, account_id, date, name, amount, currency, pending, category, logo_url, updated_at)
  VALUES (@transaction_id, @item_id, @account_id, @date, @name, @amount, @currency, @pending, @category, @logo_url, datetime('now'))
  ON CONFLICT(transaction_id) DO UPDATE SET
    account_id = excluded.account_id, date = excluded.date, name = excluded.name, amount = excluded.amount,
    currency = excluded.currency, pending = excluded.pending, category = excluded.category, logo_url = excluded.logo_url,
    updated_at = datetime('now')
`);
const deleteTxn = db.prepare('DELETE FROM plaid_transactions WHERE transaction_id = ?');

function txnRow(item_id, t) {
  return {
    transaction_id: t.transaction_id,
    item_id,
    account_id: t.account_id,
    date: t.date,
    name: t.merchant_name || t.name,
    amount: t.amount, // Plaid: positive = money out (a charge), negative = refund/payment
    currency: t.iso_currency_code,
    pending: t.pending ? 1 : 0,
    category: t.personal_finance_category?.primary || (t.category && t.category[0]) || null,
    logo_url: t.logo_url || (t.counterparties && t.counterparties[0]?.logo_url) || null,
  };
}

function serializeTxn(r) {
  return {
    transaction_id: r.transaction_id,
    account_id: r.account_id,
    date: r.date,
    name: r.name,
    amount: r.amount,
    currency: r.currency,
    pending: Boolean(r.pending),
    category: r.category,
    logo_url: r.logo_url,
  };
}

// Pull a single item's deltas into the cache, advancing its cursor.
async function syncItem(client, item) {
  let cursor = item.cursor || undefined;
  const totals = { added: 0, modified: 0, removed: 0 };
  // First sync (no cursor) returns history in pages; loop until caught up.
  for (;;) {
    const { data } = await client.transactionsSync({ access_token: item.access_token, cursor, count: 250 });
    const apply = db.transaction(() => {
      for (const t of data.added) upsertTxn.run(txnRow(item.item_id, t));
      for (const t of data.modified) upsertTxn.run(txnRow(item.item_id, t));
      for (const r of data.removed) deleteTxn.run(r.transaction_id);
    });
    apply();
    totals.added += data.added.length;
    totals.modified += data.modified.length;
    totals.removed += data.removed.length;
    cursor = data.next_cursor;
    if (!data.has_more) break;
  }
  db.prepare("UPDATE plaid_items SET cursor = ?, transactions_synced_at = datetime('now') WHERE id = ?").run(cursor, item.id);
  return totals;
}

async function syncItems(client, items) {
  const totals = { added: 0, modified: 0, removed: 0 };
  for (const item of items) {
    const r = await syncItem(client, item);
    totals.added += r.added; totals.modified += r.modified; totals.removed += r.removed;
  }
  return totals;
}

// Past transactions for one account (or all) from the local cache. The very
// first request for a freshly-linked item syncs it; afterwards it's instant.
router.get('/transactions', async (req, res) => {
  const accountId = req.query.account_id ? String(req.query.account_id) : null;
  const days = Math.min(730, Math.max(1, Number(req.query.days) || 90));
  const since = new Date();
  since.setDate(since.getDate() - days);
  const sinceStr = since.toISOString().slice(0, 10);
  try {
    const client = getClient();
    if (client) {
      const fresh = db.prepare('SELECT * FROM plaid_items WHERE transactions_synced_at IS NULL').all();
      if (fresh.length) await syncItems(client, fresh);
    }
    const rows = accountId
      ? db.prepare('SELECT * FROM plaid_transactions WHERE account_id = ? AND date >= ? ORDER BY date DESC, transaction_id DESC').all(accountId, sinceStr)
      : db.prepare('SELECT * FROM plaid_transactions WHERE date >= ? ORDER BY date DESC, transaction_id DESC').all(sinceStr);
    res.json(rows.map(serializeTxn));
  } catch (e) {
    res.status(502).json({ error: plaidError(e) });
  }
});

// Force a refresh of the cache from Plaid (pull deltas for every linked item).
router.post('/transactions/sync', async (req, res) => {
  const client = requireClient(res);
  if (!client) return;
  try {
    const items = db.prepare('SELECT * FROM plaid_items').all();
    const totals = await syncItems(client, items);
    res.json({ ok: true, ...totals });
  } catch (e) {
    res.status(502).json({ error: plaidError(e) });
  }
});

// Where a Plaid account type lands in our model.
//   credit / loan -> a debt (credit card vs installment loan)
//   everything else (depository, investment, other) -> a cash account
function destinationFor(type) {
  if (type === 'credit') return 'credit_card';
  if (type === 'loan') return 'loan';
  return 'account';
}

// Import selected Plaid accounts, routing each by its type:
// depository/investment -> accounts (cash); credit/loan -> debts.
router.post('/import_accounts', async (req, res) => {
  const client = requireClient(res);
  if (!client) return;
  const selections = Array.isArray(req.body.accounts) ? req.body.accounts : [];
  if (selections.length === 0) return res.status(400).json({ error: 'No accounts selected' });
  try {
    const hasPrimary = db.prepare('SELECT COUNT(*) AS c FROM accounts WHERE is_primary = 1').get().c > 0;
    const insertAccount = db.prepare('INSERT INTO accounts (name, balance, is_primary, plaid_account_id) VALUES (?, ?, ?, ?)');
    const insertDebt = db.prepare(
      'INSERT INTO debts (name, balance, apr, credit_limit, monthly_payment, debt_type, payment_day, plaid_account_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    );
    const { byId, byName } = importedSets();
    let madePrimary = hasPrimary;
    let accountsCreated = 0;
    let debtsCreated = 0;
    let skipped = 0;
    for (const s of selections) {
      const name = String(s.name || 'Account').slice(0, 60);
      const plaidId = s.account_id ? String(s.account_id) : null;
      // Never import the same Plaid account twice — resync updates it instead.
      if ((plaidId && byId.has(plaidId)) || byName.has(name)) { skipped++; continue; }
      const dest = destinationFor(s.type);
      if (dest === 'account') {
        const balance = Number(s.balance) || 0;
        const primary = madePrimary ? 0 : 1;
        madePrimary = true;
        insertAccount.run(name, balance, primary, plaidId);
        accountsCreated++;
      } else {
        // Plaid reports the owed amount as a positive `current` for credit/loan.
        const balance = Math.max(0, Number(s.balance) || 0);
        const limit = dest === 'credit_card' && Number.isFinite(Number(s.credit_limit)) ? Number(s.credit_limit) : null;
        // APR + minimum payment need the `liabilities` product; default to 0 so the
        // user can fill them in. Balance/limit are enough to track utilization.
        insertDebt.run(name, balance, 0, limit, 0, dest, null, plaidId);
        debtsCreated++;
      }
    }
    res.status(201).json({ ok: true, accountsCreated, debtsCreated, skipped, created: accountsCreated + debtsCreated });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Resync: pull fresh balances and push them into the already-imported rows
// (accounts get current balance; credit/loan debts get the owed amount + limit).
router.post('/resync', async (req, res) => {
  const client = requireClient(res);
  if (!client) return;
  try {
    await refreshAccountsCache(client);
    const cached = db.prepare('SELECT * FROM plaid_accounts').all();
    const setAcctById = db.prepare('UPDATE accounts SET balance = ? WHERE plaid_account_id = ?');
    const setAcctByName = db.prepare('UPDATE accounts SET balance = ?, plaid_account_id = ? WHERE plaid_account_id IS NULL AND name = ?');
    const setDebtById = db.prepare('UPDATE debts SET balance = ?, credit_limit = COALESCE(?, credit_limit) WHERE plaid_account_id = ?');
    const setDebtByName = db.prepare('UPDATE debts SET balance = ?, credit_limit = COALESCE(?, credit_limit), plaid_account_id = ? WHERE plaid_account_id IS NULL AND name = ?');
    let updated = 0;
    const tx = db.transaction(() => {
      for (const pa of cached) {
        const label = importName(pa.name, pa.mask);
        const current = pa.current ?? 0;
        const owed = Math.max(0, current);
        // Try the linked row first, then fall back to a name match (legacy imports),
        // backfilling the link so future resyncs are exact.
        let n = setAcctById.run(current, pa.account_id).changes;
        if (!n) n = setAcctByName.run(current, pa.account_id, label).changes;
        let d = setDebtById.run(owed, pa.credit_limit, pa.account_id).changes;
        if (!d) d = setDebtByName.run(owed, pa.credit_limit, pa.account_id, label).changes;
        updated += n + d;
      }
    });
    tx();
    res.json({ ok: true, updated });
  } catch (e) {
    res.status(502).json({ error: plaidError(e) });
  }
});

// Unlink an item (best-effort remove at Plaid, then delete locally).
router.delete('/items/:id', async (req, res) => {
  const item = db.prepare('SELECT * FROM plaid_items WHERE id = ?').get(req.params.id);
  if (!item) return res.status(404).json({ error: 'Not found' });
  const client = getClient();
  if (client) {
    try { await client.itemRemove({ access_token: item.access_token }); } catch { /* ignore */ }
  }
  db.prepare('DELETE FROM plaid_transactions WHERE item_id = ?').run(item.item_id);
  db.prepare('DELETE FROM plaid_accounts WHERE item_id = ?').run(item.item_id);
  db.prepare('DELETE FROM plaid_items WHERE id = ?').run(req.params.id);
  res.status(204).end();
});

function plaidError(e) {
  const d = e?.response?.data;
  if (d?.error_message) return `${d.error_code}: ${d.error_message}`;
  return e?.message || 'Plaid request failed';
}

module.exports = router;
