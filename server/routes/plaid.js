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

// Live balances for every linked item.
router.get('/accounts', async (req, res) => {
  const client = requireClient(res);
  if (!client) return;
  const items = db.prepare('SELECT * FROM plaid_items').all();
  try {
    const all = [];
    for (const item of items) {
      const resp = await client.accountsBalanceGet({ access_token: item.access_token });
      for (const a of resp.data.accounts) {
        all.push({
          item_id: item.item_id,
          institution_name: item.institution_name,
          account_id: a.account_id,
          name: a.name,
          official_name: a.official_name,
          mask: a.mask,
          type: a.type,
          subtype: a.subtype,
          current: a.balances.current,
          available: a.balances.available,
          limit: a.balances.limit,
          currency: a.balances.iso_currency_code,
        });
      }
    }
    res.json(all);
  } catch (e) {
    res.status(502).json({ error: plaidError(e) });
  }
});

// Past transactions for a single linked account (or all accounts if none given).
// Uses /transactions/get over a rolling date window; paginates per item.
router.get('/transactions', async (req, res) => {
  const client = requireClient(res);
  if (!client) return;
  const accountId = req.query.account_id ? String(req.query.account_id) : null;
  const days = Math.min(730, Math.max(1, Number(req.query.days) || 90));
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - days);
  const fmt = (d) => d.toISOString().slice(0, 10);

  const items = db.prepare('SELECT * FROM plaid_items').all();
  try {
    const out = [];
    for (const item of items) {
      // One page of 100 most-recent transactions per item is plenty for a local view.
      const resp = await client.transactionsGet({
        access_token: item.access_token,
        start_date: fmt(start),
        end_date: fmt(end),
        options: { count: 100, offset: 0, ...(accountId ? { account_ids: [accountId] } : {}) },
      }).catch((e) => {
        // An account_id that doesn't belong to this item -> skip the item.
        if (e?.response?.data?.error_code === 'INVALID_FIELD') return null;
        throw e;
      });
      if (!resp) continue;
      for (const t of resp.data.transactions) {
        out.push({
          transaction_id: t.transaction_id,
          account_id: t.account_id,
          date: t.date,
          name: t.merchant_name || t.name,
          amount: t.amount, // Plaid: positive = money out (a charge), negative = refund/payment
          currency: t.iso_currency_code,
          pending: t.pending,
          category: t.personal_finance_category?.primary || (t.category && t.category[0]) || null,
          logo_url: t.logo_url || (t.counterparties && t.counterparties[0]?.logo_url) || null,
        });
      }
    }
    out.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
    res.json(out);
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
    const insertAccount = db.prepare('INSERT INTO accounts (name, balance, is_primary) VALUES (?, ?, ?)');
    const insertDebt = db.prepare(
      'INSERT INTO debts (name, balance, apr, credit_limit, monthly_payment, debt_type, payment_day) VALUES (?, ?, ?, ?, ?, ?, ?)'
    );
    let madePrimary = hasPrimary;
    let accountsCreated = 0;
    let debtsCreated = 0;
    for (const s of selections) {
      const name = String(s.name || 'Account').slice(0, 60);
      const dest = destinationFor(s.type);
      if (dest === 'account') {
        const balance = Number(s.balance) || 0;
        const primary = madePrimary ? 0 : 1;
        madePrimary = true;
        insertAccount.run(name, balance, primary);
        accountsCreated++;
      } else {
        // Plaid reports the owed amount as a positive `current` for credit/loan.
        const balance = Math.max(0, Number(s.balance) || 0);
        const limit = dest === 'credit_card' && Number.isFinite(Number(s.credit_limit)) ? Number(s.credit_limit) : null;
        // APR + minimum payment need the `liabilities` product; default to 0 so the
        // user can fill them in. Balance/limit are enough to track utilization.
        insertDebt.run(name, balance, 0, limit, 0, dest, null);
        debtsCreated++;
      }
    }
    res.status(201).json({ ok: true, accountsCreated, debtsCreated, created: accountsCreated + debtsCreated });
  } catch (e) {
    res.status(500).json({ error: e.message });
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
  db.prepare('DELETE FROM plaid_items WHERE id = ?').run(req.params.id);
  res.status(204).end();
});

function plaidError(e) {
  const d = e?.response?.data;
  if (d?.error_message) return `${d.error_code}: ${d.error_message}`;
  return e?.message || 'Plaid request failed';
}

module.exports = router;
