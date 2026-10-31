import { describe, it, expect } from 'vitest';
import { encrypt, decrypt, isEncrypted } from './secrets.js';
describe('secrets', () => {
  it('round-trips', () => {
    const t = 'access-sandbox-abc-123';
    const e = encrypt(t);
    expect(e).not.toContain(t);
    expect(isEncrypted(e)).toBe(true);
    expect(decrypt(e)).toBe(t);
  });
  it('passes through legacy plaintext', () => {
    expect(decrypt('access-sandbox-plain')).toBe('access-sandbox-plain');
  });
  it('rejects a tampered ciphertext', () => {
    const e = encrypt('secret');
    const bad = e.slice(0, -4) + 'AAAA';
    expect(() => decrypt(bad)).toThrow();
  });
});
