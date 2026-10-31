// Shared helpers for full-dataset export/import (used by /export, /import, and scenarios).

// Groups first so group_id references resolve naturally on import. Dependent
// tables (occurrences, paid status) come after the rows they reference.
const TABLES = [
  'accounts',
  'line_item_groups',
  'income_sources',
  'income_occurrences',
  'expenses',
  'debts',
  'app_settings',
  'paid_status',
];

// Whether a dependent row still points at an existing parent after an import.
function referenceExists(db, table, row, userId) {
  if (table === 'income_occurrences') {
    return !!db.prepare('SELECT 1 FROM income_sources WHERE id = ? AND user_id = ?').get(row.income_id, userId);
  }
  if (table === 'paid_status') {
    const parent = row.entity_type === 'debt' ? 'debts' : row.entity_type === 'expense' ? 'expenses' : null;
    return !!parent && !!db.prepare(`SELECT 1 FROM ${parent} WHERE id = ? AND user_id = ?`).get(row.entity_id, userId);
  }
  return true;
}

// user_id is an implementation detail of multi-tenancy, not part of the user's
// data: it's stripped on export and re-applied on import, so a snapshot can be
// restored into any account.
function withoutUserId(row) {
  const { user_id, ...rest } = row;
  return rest;
}

function exportData(db, userId) {
  const out = {};
  for (const t of TABLES) {
    out[t] = db.prepare(`SELECT * FROM ${t} WHERE user_id = ?`).all(userId).map(withoutUserId);
  }
  return out;
}

// Replace the plan with a snapshot. Tables the snapshot doesn't mention (older
// backups and scenarios predate income_occurrences/paid_status) keep their current
// rows, minus any whose parent no longer exists. Without this, deleting
// income_sources would cascade away every received/skipped payday.
function importData(db, data, userId) {
  const tx = db.transaction(() => {
    const kept = {};
    for (const t of TABLES) {
      if (data?.[t] === undefined) {
        kept[t] = db.prepare(`SELECT * FROM ${t} WHERE user_id = ?`).all(userId).map(withoutUserId);
      }
    }
    for (const t of TABLES) db.prepare(`DELETE FROM ${t} WHERE user_id = ?`).run(userId);
    for (const t of TABLES) {
      const incoming = Array.isArray(data?.[t]) ? data[t].map(withoutUserId) : [];
      const rows = kept[t] ? kept[t].filter((row) => referenceExists(db, t, row, userId)) : incoming;
      for (const row of rows) {
        const cols = Object.keys(row);
        if (cols.length === 0) continue;
        const placeholders = cols.map(() => '?').join(', ');
        db.prepare(`INSERT INTO ${t} (user_id, ${cols.join(', ')}) VALUES (?, ${placeholders})`)
          .run(userId, ...cols.map((c) => row[c]));
      }
    }
  });
  tx();
}

// Persist an explicit display order by setting sort_order = array index.
function reorder(db, table, ids, userId) {
  if (!Array.isArray(ids)) return;
  const stmt = db.prepare(`UPDATE ${table} SET sort_order = ? WHERE id = ? AND user_id = ?`);
  const tx = db.transaction((list) => {
    list.forEach((id, i) => stmt.run(i, id, userId));
  });
  tx(ids);
}

function removeFundingAllocations(db, table, sourceType, sourceId, userId) {
  const rows = db.prepare(`SELECT id, funding_allocations, funding_rules FROM ${table} WHERE user_id = ?`).all(userId);
  const update = db.prepare(`UPDATE ${table} SET funding_allocations = ?, funding_rules = ?, updated_at = datetime('now') WHERE id = ? AND user_id = ?`);
  const tx = db.transaction(() => {
    for (const row of rows) {
      let allocations;
      let rules;
      try {
        allocations = JSON.parse(row.funding_allocations || '[]');
      } catch {
        allocations = [];
      }
      try {
        rules = JSON.parse(row.funding_rules || '[]');
      } catch {
        rules = [];
      }
      if (!Array.isArray(allocations)) allocations = [];
      if (!Array.isArray(rules)) rules = [];
      const nextAllocations = allocations.filter((a) => !(a?.source_type === sourceType && Number(a.source_id) === Number(sourceId)));
      const nextRules = rules.filter((a) => !(a?.source_type === sourceType && Number(a.source_id) === Number(sourceId)));
      if (nextAllocations.length !== allocations.length || nextRules.length !== rules.length) {
        update.run(JSON.stringify(nextAllocations), JSON.stringify(nextRules), row.id, userId);
      }
    }
  });
  tx();
}

const ORDER_BY = 'ORDER BY COALESCE(sort_order, 1000000000), id';

module.exports = { exportData, importData, reorder, removeFundingAllocations, ORDER_BY, TABLES };
