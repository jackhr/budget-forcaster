import { describe, it, expect } from 'vitest';
import { pickStored, resolveTab } from './viewPrefs';

const TABS = ['home', 'accounts', 'income', 'expenses', 'debts', 'projections', 'breakdown', 'account', 'outflows', 'transactions'];

describe('pickStored', () => {
  it('keeps a value that is still legal', () => {
    expect(pickStored('month', ['range', 'month'] as const, 'range')).toBe('month');
  });

  it('falls back when the value was removed from the app', () => {
    // 'future' was a Breakdown section until Future Expenses were removed.
    expect(pickStored('future', ['account', 'income', 'expense', 'debt'] as const, 'debt')).toBe('debt');
  });

  it('falls back when nothing is stored', () => {
    expect(pickStored(null, ['range', 'month'] as const, 'range')).toBe('range');
  });

  it('falls back on junk', () => {
    expect(pickStored('{}', ['range', 'month'] as const, 'range')).toBe('range');
  });
});

describe('resolveTab', () => {
  it('keeps a tab that still exists', () => {
    expect(resolveTab('breakdown', TABS, 'home')).toEqual({ tab: 'breakdown', view: null });
  });

  it('carries each retired chart tab onto Projections, keeping which chart', () => {
    expect(resolveTab('forecast', TABS, 'home')).toEqual({ tab: 'projections', view: 'cashflow' });
    expect(resolveTab('savings', TABS, 'home')).toEqual({ tab: 'projections', view: 'savings' });
    expect(resolveTab('networth', TABS, 'home')).toEqual({ tab: 'projections', view: 'networth' });
    expect(resolveTab('overview', TABS, 'home')).toEqual({ tab: 'projections', view: 'overview' });
  });

  it('falls back to home for an id from no known version', () => {
    expect(resolveTab('wat', TABS, 'home')).toEqual({ tab: 'home', view: null });
  });

  it('falls back when nothing is stored', () => {
    expect(resolveTab(null, TABS, 'home')).toEqual({ tab: 'home', view: null });
  });

  it('does not resurrect a legacy tab whose target no longer exists either', () => {
    expect(resolveTab('forecast', ['home', 'breakdown'], 'home')).toEqual({ tab: 'home', view: null });
  });
});
