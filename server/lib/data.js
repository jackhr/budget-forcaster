// Shared helpers for full-dataset export/import (used by /export, /import, and scenarios).

// Groups first so group_id references resolve naturally on import.
const TABLES = [
  'line_item_groups',
  'income_sources',
  'expenses',
  'scheduled_payments',
  'debts',
  'app_settings',
];

function exportData(db) {
  const out = {};
  for (const t of TABLES) out[t] = db.prepare(`SELECT * FROM ${t}`).all();
  return out;
}

function importData(db, data) {
  const tx = db.transaction(() => {
    for (const t of TABLES) db.exec(`DELETE FROM ${t}`);
    for (const t of TABLES) {
      const rows = Array.isArray(data?.[t]) ? data[t] : [];
      for (const row of rows) {
        const cols = Object.keys(row);
        if (cols.length === 0) continue;
        const placeholders = cols.map(() => '?').join(', ');
        db.prepare(`INSERT INTO ${t} (${cols.join(', ')}) VALUES (${placeholders})`)
          .run(...cols.map((c) => row[c]));
      }
    }
  });
  tx();
}

// Persist an explicit display order by setting sort_order = array index.
function reorder(db, table, ids) {
  if (!Array.isArray(ids)) return;
  const stmt = db.prepare(`UPDATE ${table} SET sort_order = ? WHERE id = ?`);
  const tx = db.transaction((list) => {
    list.forEach((id, i) => stmt.run(i, id));
  });
  tx(ids);
}

const ORDER_BY = 'ORDER BY COALESCE(sort_order, 1000000000), id';

module.exports = { exportData, importData, reorder, ORDER_BY, TABLES };
