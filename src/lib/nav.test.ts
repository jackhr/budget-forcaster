import { describe, it, expect } from 'vitest';
import { NAV, PAGE_META, PROJECTION_IDS, PROJECTION_VIEWS, TAB_IDS } from './nav';
import { LEGACY_TABS, resolveTab } from './viewPrefs';

describe('navigation', () => {
  // The bug this guards: a stored tab id with no PAGE_META entry made the
  // unguarded `PAGE_META[tab].title` lookup throw, blanking the whole app.
  it('gives every nav destination a page', () => {
    const missing = TAB_IDS.filter((id) => !(id in PAGE_META));
    expect(missing).toEqual([]);
  });

  it('has no page that is unreachable from the nav', () => {
    const orphans = Object.keys(PAGE_META).filter((id) => !TAB_IDS.includes(id as never));
    expect(orphans).toEqual([]);
  });

  it('uses each id exactly once', () => {
    expect(new Set(TAB_IDS).size).toBe(TAB_IDS.length);
  });

  it('labels every item and gives it a real icon component', () => {
    for (const group of NAV) {
      expect(group.items.length).toBeGreaterThan(0);
      for (const item of group.items) {
        expect(item.label.trim()).not.toBe('');
        // A Lucide icon, not a glyph: rendering a string here throws "Invalid tag".
        expect(typeof item.icon).toBe('object');
        expect(item.icon).toBeTruthy();
      }
    }
  });

  it('uses a distinct icon per destination', () => {
    const icons = NAV.flatMap((g) => g.items.map((i) => i.icon));
    expect(new Set(icons).size).toBe(icons.length);
  });

  it('separates planning from viewing', () => {
    const plan = NAV.find((g) => g.heading === 'Plan');
    expect(plan?.items.map((i) => i.id)).toEqual(['accounts', 'income', 'expenses', 'debts', 'goals']);
  });
});

describe('projection views', () => {
  it('keeps ids and labels in step', () => {
    expect(PROJECTION_IDS).toEqual(PROJECTION_VIEWS.map(([id]) => id));
    expect(new Set(PROJECTION_IDS).size).toBe(PROJECTION_IDS.length);
  });
});

describe('legacy tabs resolve against the real nav', () => {
  it('lands every retired id on a page that exists', () => {
    for (const [legacyId, target] of Object.entries(LEGACY_TABS)) {
      const resolved = resolveTab(legacyId, TAB_IDS, 'home');
      expect({ legacyId, tab: resolved.tab }).toEqual({ legacyId, tab: target.tab });
      expect(resolved.tab in PAGE_META).toBe(true);
      expect(PROJECTION_IDS).toContain(resolved.view);
    }
  });

  it('covers every tab the previous version had', () => {
    // What shipped before the sidebar redesign.
    const previous = ['forecast', 'savings', 'networth', 'breakdown', 'overview', 'account', 'outflows', 'transactions'];
    for (const id of previous) {
      const { tab } = resolveTab(id, TAB_IDS, 'home');
      expect({ id, landsOnARealPage: tab in PAGE_META }).toEqual({ id, landsOnARealPage: true });
    }
  });
});
