import { createRequire } from 'node:module';
import { beforeEach, describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const Database = require('better-sqlite3');
const { reattachReplacedCards, replacedAccountIds, baseName } = require('./plaidAccounts');

let db;
beforeEach(() => {
  db = new Database(':memory:');
  db.exec(`
    CREATE TABLE plaid_accounts (account_id TEXT PRIMARY KEY, item_id TEXT, name TEXT, mask TEXT, type TEXT, current REAL);
    CREATE TABLE accounts (id INTEGER PRIMARY KEY, name TEXT, plaid_account_id TEXT, updated_at TEXT);
    CREATE TABLE debts (id INTEGER PRIMARY KEY, name TEXT, plaid_account_id TEXT, updated_at TEXT);
    INSERT INTO debts VALUES (1, 'Rewards Card ••1111', 'old', NULL), (2, 'Other Card', NULL, NULL);
  `);
});
const addAccount = (id, mask, current, item = 'bank') =>
  db.prepare("INSERT INTO plaid_accounts VALUES (?, ?, 'Rewards Card', ?, 'credit', ?)").run(id, item, mask, current);
const debt = () => db.prepare('SELECT name, plaid_account_id FROM debts WHERE id = 1').get();

describe('reattachReplacedCards', () => {
  it('moves a debt from a $0 retired card to its reissued number, once', () => {
    addAccount('old', '1111', 0);
    addAccount('new', '2222', 3384.32);
    expect(reattachReplacedCards(db)).toBe(1);
    expect(debt()).toEqual({ name: 'Rewards Card ••2222', plaid_account_id: 'new' });
    expect(reattachReplacedCards(db)).toBe(0); // never flips back
    expect([...replacedAccountIds(db)]).toEqual(['old']);
  });

  it('reattaches when the old card has dropped out of Plaid entirely', () => {
    addAccount('new', '2222', 50);
    expect(reattachReplacedCards(db)).toBe(1);
    expect(debt().plaid_account_id).toBe('new');
  });

  it('leaves a card with a balance alone when a same-named card appears', () => {
    addAccount('old', '1111', 900);
    addAccount('new', '2222', 40);
    expect(reattachReplacedCards(db)).toBe(0);
    expect(debt().plaid_account_id).toBe('old');
  });

  it('does not move across different logins', () => {
    addAccount('old', '1111', 0, 'bank-a');
    addAccount('new', '2222', 40, 'bank-b');
    expect(reattachReplacedCards(db)).toBe(0);
  });

  it('strips only a trailing mask from names', () => {
    expect(baseName('Delta SkyMiles® Gold Card ••2000')).toBe('Delta SkyMiles® Gold Card');
    expect(baseName('Ash Citi')).toBe('Ash Citi');
  });
});
