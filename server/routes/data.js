const express = require('express');
const router = express.Router();
const db = require('../db/database');
const { exportData, importData } = require('../lib/data');

// Full backup of every table.
router.get('/export', (req, res) => {
  res.json({ version: 1, exported_at: new Date().toISOString(), data: exportData(db) });
});

// Restore from a backup (replaces all data).
router.post('/import', (req, res) => {
  const payload = req.body?.data ?? req.body;
  if (!payload || typeof payload !== 'object') {
    return res.status(400).json({ error: 'Expected a backup object' });
  }
  try {
    importData(db, payload);
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: 'Import failed: ' + e.message });
  }
});

module.exports = router;
