import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { settingError, HOME_LAYOUTS, DEBT_STRATEGIES } = require('./settings.js');

describe('setting validation', () => {
  it('accepts every layout and strategy the app offers', () => {
    for (const layout of HOME_LAYOUTS) expect(settingError('home_layout', layout)).toBeNull();
    for (const strategy of DEBT_STRATEGIES) expect(settingError('debt_strategy', strategy)).toBeNull();
  });

  it('rejects a value outside the allowed set', () => {
    for (const bad of ['goals', '', 'RUNWAY', 'runway;drop']) {
      expect({ bad, error: typeof settingError('home_layout', bad) }).toEqual({ bad, error: 'string' });
    }
  });

  it('checks the numeric settings are numbers', () => {
    expect(settingError('inflation_rate', '2.5')).toBeNull();
    expect(settingError('debt_extra', '0')).toBeNull();
    expect(settingError('inflation_rate', 'soon')).toMatch(/number/);
  });

  it('checks a currency is a three-letter code', () => {
    expect(settingError('currency', 'GBP')).toBeNull();
    expect(settingError('currency', 'POUNDS')).toMatch(/3-letter/);
  });

  it('leaves a key it does not know alone', () => {
    // Unvalidated keys were stored as-is before this existed; keep that.
    expect(settingError('something_new', 'anything')).toBeNull();
  });
});
