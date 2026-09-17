// Matching between cached Plaid accounts and the local accounts/debts rows they were
// imported into. Pure functions over a better-sqlite3 handle, so they're testable.

// The local name we give an imported row, matching the client's import label.
function importName(name, mask) {
  return `${name || 'Account'}${mask ? ` ••${mask}` : ''}`.slice(0, 60);
}

// A local row name without its trailing " ••1234" mask.
function baseName(name) {
  return String(name || '').replace(/\s*••\w+$/, '');
}

const kindOf = (plaidType) => (plaidType === 'credit' || plaidType === 'loan' ? 'debts' : 'accounts');

// When a bank reissues a card, Plaid reports the new card as a new account with the
// same name and a new mask. Move an imported row onto that new account when exactly
// one row is a match: same base name, same table, and its current link is either
// dangling, or a same-named $0 account of the same Item with a different mask while
// the new account carries a balance.
// Returns the number of rows moved.
function reattachReplacedCards(db, itemId = null) {
  const cached = itemId
    ? db.prepare('SELECT * FROM plaid_accounts WHERE item_id = ?').all(itemId)
    : db.prepare('SELECT * FROM plaid_accounts').all();
  const byId = new Map(db.prepare('SELECT * FROM plaid_accounts').all().map((a) => [a.account_id, a]));
  let moved = 0;
  for (const next of cached) {
    const table = kindOf(next.type);
    const rows = db.prepare(`SELECT id, name, plaid_account_id FROM ${table}`).all();
    if (rows.some((r) => r.plaid_account_id === next.account_id || r.name === importName(next.name, next.mask))) continue;
    const candidates = rows.filter((r) => {
      if (baseName(r.name) !== baseName(importName(next.name, next.mask))) return false;
      const linked = r.plaid_account_id ? byId.get(r.plaid_account_id) : null;
      if (r.plaid_account_id && !linked) return true; // dangling link
      // Still-present old card: only move off it when it reports $0 and the new card
      // carries a balance, so the row never flips back to the retired number.
      return !!linked && linked.item_id === next.item_id && linked.mask !== next.mask
        && !(Math.abs(linked.current ?? 0) > 0.005) && Math.abs(next.current ?? 0) > 0.005;
    });
    if (candidates.length !== 1) continue;
    db.prepare(`UPDATE ${table} SET plaid_account_id = ?, name = ?, updated_at = datetime('now') WHERE id = ?`)
      .run(next.account_id, importName(next.name, next.mask), candidates[0].id);
    moved++;
  }
  return moved;
}

// Cached accounts that an imported row has moved off of (the old card after a reissue).
function replacedAccountIds(db) {
  const linked = new Set([
    ...db.prepare('SELECT plaid_account_id FROM accounts').all(),
    ...db.prepare('SELECT plaid_account_id FROM debts').all(),
  ].map((r) => r.plaid_account_id).filter(Boolean));
  const all = db.prepare('SELECT * FROM plaid_accounts').all();
  return new Set(all.filter((a) => !linked.has(a.account_id) && all.some((b) =>
    b.account_id !== a.account_id && linked.has(b.account_id) && b.item_id === a.item_id && b.name === a.name && b.mask !== a.mask,
  )).map((a) => a.account_id));
}

module.exports = { importName, baseName, reattachReplacedCards, replacedAccountIds };
