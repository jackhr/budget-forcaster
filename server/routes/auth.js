// Public identity endpoints. Everything here is reachable without a session;
// every other /api route sits behind requireAuth.
const express = require('express');
const router = express.Router();
const db = require('../db/database');
const {
  SESSION_COOKIE, hashPassword, verifyPassword, createSession,
  destroySession, destroyAllSessions, cookieOptions, requireAuth,
} = require('../lib/auth');

const MIN_PASSWORD = 10;
const MAX_PASSWORD = 200; // scrypt cost is paid on the server, so cap the input
const MAX_ATTEMPTS = 10;
const ATTEMPT_WINDOW_MS = 15 * 60 * 1000;

// In-memory throttle. Resets on restart, which is acceptable for a single
// process; a hosted deployment behind multiple workers needs a shared store.
const attempts = new Map();

function throttleKey(req, email) {
  return `${req.ip}|${email}`;
}

function tooManyAttempts(key) {
  const entry = attempts.get(key);
  if (!entry) return false;
  if (Date.now() - entry.first > ATTEMPT_WINDOW_MS) {
    attempts.delete(key);
    return false;
  }
  return entry.count >= MAX_ATTEMPTS;
}

function recordFailure(key) {
  const entry = attempts.get(key);
  if (!entry || Date.now() - entry.first > ATTEMPT_WINDOW_MS) {
    attempts.set(key, { count: 1, first: Date.now() });
    return;
  }
  entry.count += 1;
}

function normalizeEmail(email) {
  return String(email ?? '').trim().toLowerCase();
}

// Deliberately permissive: the only thing that matters is that it's a plausible
// single address, not that it matches the RFC grammar.
function validEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 320;
}

function publicUser(user) {
  return { id: user.id, email: user.email, name: user.name ?? null };
}

function issueSession(req, res, user, status = 200) {
  const { token } = createSession(user.id, {
    userAgent: req.get('user-agent') ?? null,
    ip: req.ip ?? null,
  });
  res.cookie(SESSION_COOKIE, token, cookieOptions());
  res.status(status).json({ user: publicUser(user) });
}

router.post('/register', (req, res) => {
  const { email, password, name } = req.body ?? {};
  const normalized = normalizeEmail(email);
  if (!validEmail(normalized)) {
    return res.status(400).json({ error: 'Enter a valid email address' });
  }
  if (typeof password !== 'string' || password.length < MIN_PASSWORD) {
    return res.status(400).json({ error: `Password must be at least ${MIN_PASSWORD} characters` });
  }
  if (password.length > MAX_PASSWORD) {
    return res.status(400).json({ error: 'Password is too long' });
  }
  if (db.prepare('SELECT 1 FROM users WHERE email_normalized = ?').get(normalized)) {
    return res.status(409).json({ error: 'An account with that email already exists' });
  }

  // Claiming pre-auth data has to happen in the same transaction as the insert,
  // or a second concurrent registration could also see the data as unowned.
  const register = db.transaction(() => {
    const adoptsExistingData = db.hasUnownedData();
    const result = db.prepare(
      'INSERT INTO users (email, email_normalized, password_hash, name) VALUES (?, ?, ?, ?)'
    ).run(String(email).trim(), normalized, hashPassword(password), name?.trim() || null);
    if (adoptsExistingData) db.claimUnownedData(result.lastInsertRowid);
    return db.prepare('SELECT * FROM users WHERE id = ?').get(result.lastInsertRowid);
  });
  issueSession(req, res, register(), 201);
});

router.post('/login', (req, res) => {
  const { email, password } = req.body ?? {};
  const normalized = normalizeEmail(email);
  const key = throttleKey(req, normalized);
  if (tooManyAttempts(key)) {
    return res.status(429).json({ error: 'Too many attempts. Try again in a few minutes.' });
  }

  const user = db.prepare('SELECT * FROM users WHERE email_normalized = ?').get(normalized);
  // Same message and same work either way, so the response can't be used to
  // enumerate which emails have accounts.
  if (!user || !verifyPassword(String(password ?? ''), user.password_hash)) {
    recordFailure(key);
    return res.status(401).json({ error: 'Incorrect email or password' });
  }
  attempts.delete(key);
  issueSession(req, res, user);
});

router.post('/logout', (req, res) => {
  destroySession(req.cookies?.[SESSION_COOKIE]);
  res.clearCookie(SESSION_COOKIE, { ...cookieOptions(), maxAge: undefined });
  res.status(204).end();
});

// The client calls this on boot to decide between the landing page and the app.
router.get('/me', (req, res) => {
  res.json({ user: req.user ? publicUser(req.user) : null });
});

router.put('/password', requireAuth, (req, res) => {
  const { current_password, new_password } = req.body ?? {};
  if (typeof new_password !== 'string' || new_password.length < MIN_PASSWORD) {
    return res.status(400).json({ error: `Password must be at least ${MIN_PASSWORD} characters` });
  }
  if (new_password.length > MAX_PASSWORD) {
    return res.status(400).json({ error: 'Password is too long' });
  }
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (!verifyPassword(String(current_password ?? ''), user.password_hash)) {
    return res.status(401).json({ error: 'Current password is incorrect' });
  }
  db.prepare("UPDATE users SET password_hash = ?, updated_at = datetime('now') WHERE id = ?")
    .run(hashPassword(new_password), user.id);
  // Changing a password revokes every other device, then re-establishes this one.
  destroyAllSessions(user.id);
  issueSession(req, res, user);
});

module.exports = router;
