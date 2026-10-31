// Encryption for secrets we must be able to read back — currently Plaid access
// tokens, which are bearer credentials for someone's bank data. AES-256-GCM, so
// a tampered ciphertext fails to decrypt rather than returning garbage.
//
// Key rotation and a real KMS are deliberately out of scope; see docs/ICEBOX.md I4.
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const PREFIX = 'enc.v1.';
const KEY_FILE = path.join(__dirname, '..', 'db', 'secret.key');

// APP_SECRET wins in a real deployment. Locally we generate a key file next to
// the database (gitignored) so dev works with no setup and still isn't plaintext.
function loadKey() {
  if (process.env.APP_SECRET) {
    return crypto.createHash('sha256').update(process.env.APP_SECRET).digest();
  }
  try {
    return Buffer.from(fs.readFileSync(KEY_FILE, 'utf8').trim(), 'base64');
  } catch {
    const key = crypto.randomBytes(32);
    fs.mkdirSync(path.dirname(KEY_FILE), { recursive: true });
    fs.writeFileSync(KEY_FILE, key.toString('base64'), { mode: 0o600 });
    return key;
  }
}

let cachedKey = null;
function key() {
  if (!cachedKey) cachedKey = loadKey();
  return cachedKey;
}

function encrypt(plaintext) {
  if (plaintext == null) return plaintext;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key(), iv);
  const body = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return PREFIX + Buffer.concat([iv, tag, body]).toString('base64');
}

// Values written before encryption existed are returned as-is, so an existing
// database keeps working; they're re-encrypted on the next write.
function decrypt(value) {
  if (typeof value !== 'string' || !value.startsWith(PREFIX)) return value;
  const raw = Buffer.from(value.slice(PREFIX.length), 'base64');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key(), raw.subarray(0, 12));
  decipher.setAuthTag(raw.subarray(12, 28));
  return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString('utf8');
}

function isEncrypted(value) {
  return typeof value === 'string' && value.startsWith(PREFIX);
}

module.exports = { encrypt, decrypt, isEncrypted };
