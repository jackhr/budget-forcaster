import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import {
  DEFAULT_HOME_LAYOUT, HOME_LAYOUTS, HOME_LAYOUT_IDS, homeLayoutLabel, resolveHomeLayout,
} from './homeLayout';

const require = createRequire(import.meta.url);

describe('home layout', () => {
  it('falls back to the default for anything unrecognized', () => {
    // The bug class: a value stored by another build must not render nothing.
    for (const raw of [null, undefined, '', 'goals', 'runway ', 'RUNWAY', '{}']) {
      expect({ raw, layout: resolveHomeLayout(raw) }).toEqual({ raw, layout: DEFAULT_HOME_LAYOUT });
    }
  });

  it('keeps a value it does recognize', () => {
    for (const id of HOME_LAYOUT_IDS) {
      expect(resolveHomeLayout(id)).toBe(id);
    }
  });

  it('defaults to runway and safety', () => {
    // Confirmed with the owner: risk first, configurable from day one.
    expect(DEFAULT_HOME_LAYOUT).toBe('runway');
    expect(HOME_LAYOUT_IDS).toContain(DEFAULT_HOME_LAYOUT);
  });

  it('describes every layout it offers', () => {
    for (const layout of HOME_LAYOUTS) {
      expect(layout.label.trim()).not.toBe('');
      expect(layout.description.trim()).not.toBe('');
    }
    expect(new Set(HOME_LAYOUT_IDS).size).toBe(HOME_LAYOUT_IDS.length);
  });

  it('labels a known layout and passes an unknown one through', () => {
    expect(homeLayoutLabel('runway')).toBe('Runway & safety');
    expect(homeLayoutLabel('nope' as never)).toBe('nope');
  });

  it('offers exactly the layouts the server will accept', () => {
    // A layout the picker offers but the API rejects would fail only on save.
    const { HOME_LAYOUTS: serverLayouts } = require('../../server/lib/settings.js');
    expect([...serverLayouts].sort()).toEqual([...HOME_LAYOUT_IDS].sort());
  });
});
