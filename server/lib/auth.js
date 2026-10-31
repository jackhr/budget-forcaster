// Identity: password hashing, session issue/lookup, and the middleware that
// gates every non-public route. Sessions are opaque random tokens held in an
// httpOnly cookie; only their SHA-256 hash is stored, so a DB leak can't be
// replayed as a login.
const crypto = require('crypto');
const db = require('../db/database');

const SESSION_COOKIE = 'bf_session';
const SESSION_DAYS = 30;
// scrypt is memory-hard and built into Node, so there's no native dependency to
// compile. These are the OWASP-suggested parameters (N=2^17, r=8, p=1).
const SCRYPT = { N: 131072, r: 8, p: 1, keylen: 64, maxmem: 160 * 1024 * 1024 };

function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const key = crypto.scryptSync(password, salt, SCRYPT.keylen, SCRYPT);
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString('base64')}$${key.toString('base64')}`;
}

// Constant-time comparison; never short-circuits on a mismatched prefix.
function verifyPassword(password, stored) {
  if (typeof stored !== 'string') return false;
  const [scheme, N, r, p, salt, key] = stored.split('$');
  if (scheme !== 'scrypt') return false;
  let expected;
  let actual;
  try {
    expected = Buffer.from(key, 'base64');
    actual = crypto.scryptSync(password, Buffer.from(salt, 'base64'), expected.length, {
      N: Number(N), r: Number(r), p: Number(p), maxmem: SCRYPT.maxmem,
    });
  } catch {
    return false;
  }
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function createSession(userId, { userAgent = null, ip = null } = {}) {
  const token = crypto.randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86400_000).toISOString();
  db.prepare(
    'INSERT INTO sessions (token_hash, user_id, expires_at, user_agent, ip) VALUES (?, ?, ?, ?, ?)'
  ).run(hashToken(token), userId, expiresAt, userAgent, ip);
  return { token, expiresAt };
}

// Returns the owning user, or null when the token is unknown or expired. Expired
// rows are swept opportunistically so the table doesn't grow without bound.
function userForToken(token) {
  if (!token) return null;
  const row = db.prepare(
    `SELECT s.token_hash, s.expires_at, u.id, u.email, u.name
     FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = ?`
  ).get(hashToken(token));
  if (!row) return null;
  if (new Date(row.expires_at).getTime() <= Date.now()) {
    db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(row.token_hash);
    return null;
  }
  return { id: row.id, email: row.email, name: row.name };
}

function destroySession(token) {
  if (token) db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(hashToken(token));
}

function destroyAllSessions(userId) {
  db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);
}

function cookieOptions() {
  return {
    httpOnly: true,
    // Same-site blocks the cross-origin form posts that CSRF relies on; the API
    // is JSON-only and never acts on a top-level navigation.
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: SESSION_DAYS * 86400_000,
  };
}

// Attaches req.user when the request carries a valid session. Doesn't reject —
// that's requireAuth's job — so public routes can still personalize.
function attachUser(req, res, next) {
  req.user = userForToken(req.cookies?.[SESSION_COOKIE]) ?? null;
  next();
}

function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Authentication required' });
  next();
}

module.exports = {
  SESSION_COOKIE,
  hashPassword,
  verifyPassword,
  createSession,
  userForToken,
  destroySession,
  destroyAllSessions,
  cookieOptions,
  attachUser,
  requireAuth,
};
