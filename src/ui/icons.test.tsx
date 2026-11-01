import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import AppShell from '../components/AppShell';
import { NAV } from '../lib/nav';
import { AuthProvider } from '../auth/AuthProvider';
import AuthScreen from '../auth/AuthScreen';
import ConfirmButton from '../components/ConfirmButton';
import CollapseToggle from '../components/CollapseToggle';
import { AlertTriangle } from 'lucide-react';
import { Banner, Button } from './index';

describe('icons render as SVG, not glyphs', () => {
  it('draws a distinct lucide icon for every nav destination', () => {
    const html = renderToStaticMarkup(
      <AuthProvider>
        <AppShell groups={NAV} current="home" onSelect={() => {}} title="Home"><p /></AppShell>
      </AuthProvider>,
    );
    // Every destination draws a Lucide icon, and no two share one. Counting
    // every svg in the shell would also count the brand mark and the sidebar
    // collapse control, which aren't destinations.
    const drawn = new Set(html.match(/lucide-[a-z-]+/g) ?? []);
    for (const item of NAV.flatMap((g) => g.items)) {
      const expected = `lucide-${item.icon.displayName!.replace(/(?<!^)([A-Z])/g, '-$1').toLowerCase()}`;
      expect({ id: item.id, drawn: drawn.has(expected) }).toEqual({ id: item.id, drawn: true });
    }
    expect(html).toContain('lucide-layout-dashboard');
    expect(html).toContain('lucide-wallet');
    expect(html).toContain('lucide-credit-card');
  });

  it('uses eye icons on the password toggle', () => {
    const html = renderToStaticMarkup(
      <AuthProvider><AuthScreen mode="login" onModeChange={() => {}} onBack={() => {}} /></AuthProvider>,
    );
    expect(html).toContain('lucide-eye');
    expect(html).toContain('lucide-arrow-left');
  });

  it('uses a chevron for collapse and an X for delete', () => {
    expect(renderToStaticMarkup(<CollapseToggle collapsed onToggle={() => {}} />)).toContain('lucide-chevron-right');
    expect(renderToStaticMarkup(<CollapseToggle collapsed={false} onToggle={() => {}} />)).toContain('lucide-chevron-down');
    const del = renderToStaticMarkup(<ConfirmButton onConfirm={() => {}}><span>x</span></ConfirmButton>);
    expect(del).toContain('<span>x</span>');
  });

  it('puts a warning icon in banners', () => {
    expect(renderToStaticMarkup(<Banner>careful</Banner>)).toContain('lucide-triangle-alert');
  });
});

describe('icons sit on the same line as their label', () => {
  const css = readFileSync(new URL('../index.css', import.meta.url), 'utf8');

  it('overrides preflight so a Lucide icon is inline by default', () => {
    // Preflight's `svg { display: block }` put the glyph on its own line and
    // stacked the label underneath it wherever the container wasn't flex.
    expect(css).toMatch(/svg\.lucide\s*\{[^}]*display:\s*inline-block/);
  });

  it('keeps that override inside a layer', () => {
    // Unlayered CSS beats every Tailwind utility, so `block` on an icon has to
    // still win. Everything after @theme belongs to a @layer.
    const rule = css.indexOf('svg.lucide');
    const layer = css.lastIndexOf('@layer', rule);
    expect(layer).toBeGreaterThan(-1);
    expect(css.slice(layer, rule)).toContain('base');
  });

  it('lays out an icon beside text with a flex row and a gap', () => {
    const html = renderToStaticMarkup(
      <Button><AlertTriangle size={13} strokeWidth={2} aria-hidden="true" />Sync</Button>,
    );
    const classes = html.match(/class="([^"]*)"/)![1];
    expect(classes).toContain('inline-flex');
    expect(classes).toContain('items-center');
    expect(classes).toMatch(/\bgap-\d/);
  });
});
