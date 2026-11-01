// End-to-end tenant isolation: boots the real server against a scratch database,
// registers two users, and asserts that nothing one creates is visible or
// mutable by the other. This is the regression net for the user_id scoping —
// a missed WHERE clause in any route shows up here as a cross-tenant read.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const serverDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const PORT = 3999;
const BASE = `http://127.0.0.1:${PORT}/api`;

let child;
let dataDir;

function api(pathname, { method = 'GET', body, cookie } = {}) {
  return fetch(BASE + pathname, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function sessionCookie(res) {
  const raw = res.headers.get('set-cookie');
  return raw ? raw.split(';')[0] : null;
}

async function register(email) {
  const res = await api('/auth/register', {
    method: 'POST',
    body: { email, password: 'correct-horse-battery' },
  });
  expect(res.status).toBe(201);
  return sessionCookie(res);
}

beforeAll(async () => {
  dataDir = mkdtempSync(path.join(tmpdir(), 'bf-isolation-'));
  child = spawn(process.execPath, ['server.js'], {
    cwd: serverDir,
    env: { ...process.env, PORT: String(PORT), BF_DB_PATH: path.join(dataDir, 'test.db'), NODE_ENV: 'test' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stderr.on('data', (d) => process.stderr.write(`[server] ${d}`));
  const deadline = Date.now() + 20000;
  for (;;) {
    try {
      const res = await fetch(`${BASE}/health`);
      if (res.ok) break;
    } catch { /* not up yet */ }
    if (Date.now() > deadline) throw new Error('server did not start');
    await new Promise((r) => setTimeout(r, 150));
  }
}, 30000);

afterAll(() => {
  child?.kill();
  if (dataDir) rmSync(dataDir, { recursive: true, force: true });
});

describe('authentication', () => {
  it('rejects every data endpoint without a session', async () => {
    for (const route of ['/income', '/expenses', '/debts', '/accounts', '/goals', '/groups', '/settings', '/paid', '/scenarios', '/export', '/plaid/status']) {
      const res = await api(route);
      expect({ route, status: res.status }).toEqual({ route, status: 401 });
    }
  });

  it('leaves health public', async () => {
    expect((await api('/health')).status).toBe(200);
  });

  it('refuses a duplicate email and a weak password', async () => {
    await register('dupe@example.com');
    const again = await api('/auth/register', { method: 'POST', body: { email: 'DUPE@example.com', password: 'correct-horse-battery' } });
    expect(again.status).toBe(409); // case-insensitive match

    const weak = await api('/auth/register', { method: 'POST', body: { email: 'weak@example.com', password: 'short' } });
    expect(weak.status).toBe(400);
  });

  it('logs in with the right password and not the wrong one', async () => {
    await register('login@example.com');
    const bad = await api('/auth/login', { method: 'POST', body: { email: 'login@example.com', password: 'wrong-password-here' } });
    expect(bad.status).toBe(401);

    const good = await api('/auth/login', { method: 'POST', body: { email: 'login@example.com', password: 'correct-horse-battery' } });
    expect(good.status).toBe(200);
    expect(sessionCookie(good)).toMatch(/^bf_session=/);
  });

  it('stops accepting a session after logout', async () => {
    const cookie = await register('logout@example.com');
    expect((await api('/accounts', { cookie })).status).toBe(200);
    expect((await api('/auth/logout', { method: 'POST', cookie })).status).toBe(204);
    expect((await api('/accounts', { cookie })).status).toBe(401);
  });
});

describe('tenant isolation', () => {
  let alice;
  let bob;
  let aliceIds;

  beforeAll(async () => {
    alice = await register('alice@example.com');
    bob = await register('bob@example.com');

    const mk = async (route, body) => {
      const res = await api(route, { method: 'POST', body, cookie: alice });
      expect(res.status).toBe(201);
      return (await res.json()).id;
    };
    aliceIds = {
      account: await mk('/accounts', { name: 'Alice Checking', balance: 5000 }),
      income: await mk('/income', { name: 'Alice Salary', monthly_amount: 4000, frequency: 'monthly' }),
      expense: await mk('/expenses', { name: 'Alice Rent', monthly_amount: 1500, frequency: 'monthly', start_date: '2026-01-01' }),
      debt: await mk('/debts', { name: 'Alice Card', balance: 900, apr: 20, monthly_payment: 100, debt_type: 'credit_card' }),
      group: await mk('/groups', { name: 'Alice Group', kind: 'expense' }),
    };
    aliceIds.goal = await mk('/goals', { name: 'Alice Fund', kind: 'savings', target_amount: 10000 });
    await api('/settings/currency', { method: 'PUT', body: { value: 'GBP' }, cookie: alice });
  });

  it('shows each user only their own rows', async () => {
    for (const [route, aliceName] of [
      ['/income', 'Alice Salary'],
      ['/expenses', 'Alice Rent'],
      ['/debts', 'Alice Card'],
      ['/groups', 'Alice Group'],
      ['/goals', 'Alice Fund'],
    ]) {
      const mine = await (await api(route, { cookie: alice })).json();
      expect(mine.map((r) => r.name)).toContain(aliceName);

      const theirs = await (await api(route, { cookie: bob })).json();
      expect(theirs.map((r) => r.name)).not.toContain(aliceName);
    }
  });

  it("does not leak Alice's account into Bob's list", async () => {
    const bobAccounts = await (await api('/accounts', { cookie: bob })).json();
    expect(bobAccounts.map((a) => a.name)).not.toContain('Alice Checking');
  });

  it('keeps settings per user', async () => {
    expect((await (await api('/settings', { cookie: alice })).json()).currency).toBe('GBP');
    expect((await (await api('/settings', { cookie: bob })).json()).currency).toBeUndefined();
  });

  it("refuses to point a goal at another user's account or debt", async () => {
    // Accepting the id would silently attach Bob's goal to Alice's balance.
    const stolenAccount = await api('/goals', {
      method: 'POST',
      body: { name: 'Theirs', kind: 'savings', target_amount: 100, account_id: aliceIds.account },
      cookie: bob,
    });
    expect(stolenAccount.status).toBe(400);

    const stolenDebt = await api('/goals', {
      method: 'POST',
      body: { name: 'Theirs', kind: 'debt_payoff', debt_id: aliceIds.debt },
      cookie: bob,
    });
    expect(stolenDebt.status).toBe(400);

    expect((await (await api('/goals', { cookie: bob })).json())).toEqual([]);
  });

  it('validates what a goal can be', async () => {
    const post = (body) => api('/goals', { method: 'POST', body, cookie: alice });

    expect((await post({ kind: 'savings', target_amount: 1 })).status).toBe(400);           // no name
    expect((await post({ name: 'x', kind: 'retire', target_amount: 1 })).status).toBe(400); // unknown kind
    expect((await post({ name: 'x', kind: 'savings' })).status).toBe(400);                  // no amount
    expect((await post({ name: 'x', kind: 'savings', target_amount: 0 })).status).toBe(400);
    expect((await post({ name: 'x', kind: 'savings', target_amount: 1, target_date: 'soon' })).status).toBe(400);

    // A payoff goal needs no amount — its target is zero by definition.
    const payoff = await post({ name: 'Clear it', kind: 'debt_payoff', debt_id: aliceIds.debt });
    expect(payoff.status).toBe(201);
    const row = await payoff.json();
    expect(row.target_amount).toBeNull();
    // The balance owed when it was set, so progress has a baseline.
    expect(row.start_amount).toBe(900);
  });

  it('keeps a goal out of an export belonging to someone else', async () => {
    const exported = async (cookie) => (await (await api('/export', { cookie })).json()).data;

    expect((await exported(bob)).goals.map((g) => g.name)).not.toContain('Alice Fund');

    const mine = (await exported(alice)).goals;
    expect(mine.map((g) => g.name)).toContain('Alice Fund');
    // user_id is stripped so a snapshot restores into any account.
    expect(mine.every((g) => !('user_id' in g))).toBe(true);
  });

  it('lets a user change their own profile but not take another email', async () => {
    const profile = (body, cookie) => api('/auth/profile', { method: 'PUT', body, cookie });

    const renamed = await profile({ name: 'Alice A.' }, alice);
    expect(renamed.status).toBe(200);
    expect((await renamed.json()).user.name).toBe('Alice A.');

    // Bob's address is taken; the attempt must not move it or silently no-op.
    const bobEmail = (await (await api('/auth/me', { cookie: bob })).json()).user.email;
    const clash = await profile({ email: bobEmail }, alice);
    expect(clash.status).toBe(409);
    expect((await (await api('/auth/me', { cookie: bob })).json()).user.email).toBe(bobEmail);

    const invalid = await profile({ email: 'not-an-email' }, alice);
    expect(invalid.status).toBe(400);

    const anonymous = await profile({ name: 'nobody' });
    expect(anonymous.status).toBe(401);
  });

  it('keeps the home layout per user, and rejects one it does not offer', async () => {
    const set = (value, cookie) => api('/settings/home_layout', { method: 'PUT', body: { value }, cookie });

    expect((await set('balance', alice)).status).toBe(200);
    expect((await (await api('/settings', { cookie: alice })).json()).home_layout).toBe('balance');
    expect((await (await api('/settings', { cookie: bob })).json()).home_layout).toBeUndefined();

    // An unknown layout must not reach the database — the client would then
    // fall back to the default and the saved choice would look ignored.
    expect((await set('goals', alice)).status).toBe(400);
    expect((await (await api('/settings', { cookie: alice })).json()).home_layout).toBe('balance');
  });

  it("404s when Bob reads, updates or deletes Alice's rows by id", async () => {
    const targets = [
      ['/income', aliceIds.income, { name: 'hacked', monthly_amount: 1 }],
      ['/expenses', aliceIds.expense, { name: 'hacked', monthly_amount: 1 }],
      ['/debts', aliceIds.debt, { name: 'hacked', balance: 1, monthly_payment: 1 }],
      ['/accounts', aliceIds.account, { name: 'hacked', balance: 1 }],
      ['/groups', aliceIds.group, { name: 'hacked' }],
      ['/goals', aliceIds.goal, { name: 'hacked', kind: 'savings', target_amount: 1 }],
    ];
    for (const [route, id, body] of targets) {
      const put = await api(`${route}/${id}`, { method: 'PUT', body, cookie: bob });
      expect({ route, op: 'PUT', status: put.status }).toEqual({ route, op: 'PUT', status: 404 });

      const del = await api(`${route}/${id}`, { method: 'DELETE', cookie: bob });
      expect({ route, op: 'DELETE', status: del.status }).toEqual({ route, op: 'DELETE', status: 404 });
    }
    // and Alice's data survived every one of those attempts
    const stillThere = await (await api('/expenses', { cookie: alice })).json();
    expect(stillThere.map((e) => e.name)).toContain('Alice Rent');
  });

  it("refuses to mark Alice's debt paid as Bob", async () => {
    const res = await api(`/paid/debt/${aliceIds.debt}`, { method: 'PUT', body: { paid: true }, cookie: bob });
    expect(res.status).toBe(404);
  });

  it('exports only the requesting user\'s data', async () => {
    const { data } = await (await api('/export', { cookie: bob })).json();
    const names = [...data.expenses, ...data.debts, ...data.income_sources, ...data.accounts].map((r) => r.name);
    expect(names).not.toContain('Alice Rent');
    expect(names).not.toContain('Alice Card');

    const aliceExport = await (await api('/export', { cookie: alice })).json();
    expect(aliceExport.data.expenses.map((e) => e.name)).toContain('Alice Rent');
    // user_id is a tenancy detail, not part of the user's data
    expect(aliceExport.data.expenses[0]).not.toHaveProperty('user_id');
  });

  it("an import by Bob does not touch Alice's data", async () => {
    const res = await api('/import', {
      method: 'POST',
      cookie: bob,
      body: { data: { expenses: [{ name: 'Bob Only', monthly_amount: 10, frequency: 'monthly', start_date: '2026-01-01', funding_allocations: '[]', funding_rules: '[]' }] } },
    });
    expect(res.status).toBe(200);

    const bobExpenses = await (await api('/expenses', { cookie: bob })).json();
    expect(bobExpenses.map((e) => e.name)).toEqual(['Bob Only']);

    const aliceExpenses = await (await api('/expenses', { cookie: alice })).json();
    expect(aliceExpenses.map((e) => e.name)).toContain('Alice Rent');
  });

  it('scopes scenarios to their owner', async () => {
    const saved = await api('/scenarios', { method: 'POST', body: { name: 'Alice Plan' }, cookie: alice });
    expect(saved.status).toBe(201);
    const id = (await saved.json()).id;

    expect((await (await api('/scenarios', { cookie: bob })).json())).toEqual([]);
    expect((await api(`/scenarios/${id}/restore`, { method: 'POST', cookie: bob })).status).toBe(404);
    expect((await api(`/scenarios/${id}`, { method: 'DELETE', cookie: bob })).status).toBe(404);
  });

  it('gives each user their own primary account', async () => {
    await api('/accounts', { method: 'POST', body: { name: 'Bob Checking', balance: 10 }, cookie: bob });
    const aliceAccounts = await (await api('/accounts', { cookie: alice })).json();
    const bobAccounts = await (await api('/accounts', { cookie: bob })).json();
    expect(aliceAccounts.filter((a) => a.is_primary)).toHaveLength(1);
    expect(bobAccounts.filter((a) => a.is_primary)).toHaveLength(1);
  });
});
