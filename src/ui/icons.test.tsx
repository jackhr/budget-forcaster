import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import AppShell from '../components/AppShell';
import { NAV } from '../lib/nav';
import { AuthProvider } from '../auth/AuthProvider';
import AuthScreen from '../auth/AuthScreen';
import ConfirmButton from '../components/ConfirmButton';
import CollapseToggle from '../components/CollapseToggle';
import { Banner } from './index';

describe('icons render as SVG, not glyphs', () => {
  it('draws a distinct lucide icon for every nav destination', () => {
    const html = renderToStaticMarkup(
      <AuthProvider>
        <AppShell groups={NAV} current="home" onSelect={() => {}} title="Home"><p /></AppShell>
      </AuthProvider>,
    );
    const svgs = html.match(/<svg[^>]*lucide/g) ?? [];
    // one per nav item, plus the brand mark is a plain svg (not lucide)
    expect(svgs.length).toBe(NAV.flatMap((g) => g.items).length);
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
