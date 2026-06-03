const express = require('express');
const router = express.Router();
const db = require('../db/database');
const { exportData, importData } = require('../lib/data');

// List scenarios (includes snapshot so the client can compare without a round-trip).
router.get('/', (req, res) => {
  const rows = db.prepare('SELECT * FROM scenarios ORDER BY created_at DESC').all();
  res.json(rows.map((r) => ({ ...r, snapshot: JSON.parse(r.snapshot) })));
});

// Save the current state as a named scenario.
router.post('/', (req, res) => {
  const { name } = req.body;
  if (!name || !String(name).trim()) {
    return res.status(400).json({ error: 'name is required' });
  }
  const snapshot = JSON.stringify(exportData(db));
  const result = db.prepare('INSERT INTO scenarios (name, snapshot) VALUES (?, ?)').run(String(name).trim(), snapshot);
  const row = db.prepare('SELECT * FROM scenarios WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json({ ...row, snapshot: JSON.parse(row.snapshot) });
});

// Replace current data with a scenario's snapshot.
router.post('/:id/restore', (req, res) => {
  const row = db.prepare('SELECT * FROM scenarios WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  try {
    importData(db, JSON.parse(row.snapshot));
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: 'Restore failed: ' + e.message });
  }
});

router.delete('/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM scenarios WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Not found' });
  db.prepare('DELETE FROM scenarios WHERE id = ?').run(req.params.id);
  res.status(204).end();
});

module.exports = router;
