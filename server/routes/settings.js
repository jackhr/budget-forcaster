const express = require('express');
const router = express.Router();
const db = require('../db/database');

// Returns all settings as a flat key/value object
router.get('/', (req, res) => {
  const rows = db.prepare('SELECT key, value FROM app_settings').all();
  const settings = {};
  for (const row of rows) settings[row.key] = row.value;
  res.json(settings);
});

// Upsert a single setting
router.put('/:key', (req, res) => {
  const { key } = req.params;
  const { value } = req.body;
  if (value == null) return res.status(400).json({ error: 'value is required' });

  db.prepare(
    `INSERT INTO app_settings (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`
  ).run(key, String(value));

  res.json({ key, value: String(value) });
});

module.exports = router;
