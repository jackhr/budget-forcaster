import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { normalizeDate } = require('./dates');

describe('normalizeDate', () => {
  it('keeps valid full dates', () => {
    expect(normalizeDate('2026-08-01', 'start_date')).toBe('2026-08-01');
  });

  it('normalizes month-only dates to the first day', () => {
    expect(normalizeDate('2027-01', 'start_date')).toBe('2027-01-01');
  });

  it('preserves null for optional dates', () => {
    expect(normalizeDate(null, 'end_date')).toBeNull();
  });

  it('rejects malformed dates', () => {
    expect(() => normalizeDate('2026-8--01', 'start_date')).toThrow('start_date must be YYYY-MM-DD or YYYY-MM');
  });
});
