import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import AppShell from './AppShell';
import { NAV } from '../lib/nav';
import { AuthProvider } from '../auth/AuthProvider';

function shell(stored: string | null) {
  // useCollapsed reads localStorage; '1' is the collapsed state.
  const original = globalThis.localStorage;
  Object.defineProperty(globalThis, 'localStorage', {
    value: { getItem: () => stored, setItem: () => {} },
    configurable: true,
  });
  try {
    return renderToStaticMarkup(
      <AuthProvider>
        <AppShell groups={NAV} current="home" onSelect={() => {}} title="Home"><p>content</p></AppShell>
      </AuthProvider>,
    );
  } finally {
    if (original) Object.defineProperty(globalThis, 'localStorage', { value: original, configurable: true });
    else delete (globalThis as { localStorage?: unknown }).localStorage;
  }
}

const labels = NAV.flatMap((g) => g.items).map((i) => i.label);

describe('sidebar', () => {
  it('shows every destination label when expanded', () => {
    const html = shell('0');
    for (const label of labels) {
      // Inside the nav button specifically — "Home" also appears as the page title.
      expect({ label, shown: html.includes(`${label}</button>`) }).toEqual({ label, shown: true });
    }
    expect(html).toContain('Budget Forecaster');
  });

  it('shows no destination label when collapsed', () => {
    const html = shell('1');
    for (const label of labels) {
      expect({ label, shown: html.includes(`${label}</button>`) }).toEqual({ label, shown: false });
    }
  });

  it('drops to icons only when collapsed', () => {
    const html = shell('1');
    // The wordmark and the group headings go; the icons stay.
    expect(html).not.toContain('Budget Forecaster');
    expect(html).toContain('lucide-layout-dashboard');
    expect(html).toContain('w-[64px]');
  });

  it('keeps every destination reachable and named when collapsed', () => {
    const html = shell('1');
    // With the text gone, the name has to live on the button or the icon is
    // unlabelled for anyone not using their eyes.
    for (const label of labels) {
      expect({ label, labelled: html.includes(`aria-label="${label}"`) }).toEqual({ label, labelled: true });
      expect({ label, titled: html.includes(`title="${label}"`) }).toEqual({ label, titled: true });
    }
  });

  it('does not label buttons twice when expanded', () => {
    // Visible text is the label; a duplicate aria-label would be read out over it.
    const html = shell('0');
    for (const label of labels) {
      expect({ label, aria: html.includes(`aria-label="${label}"`) }).toEqual({ label, aria: false });
    }
  });

  it('offers the toggle, stating which way it goes', () => {
    expect(shell('0')).toContain('Collapse sidebar to icons');
    expect(shell('1')).toContain('Expand sidebar');
  });

  it('marks the current page either way', () => {
    expect(shell('0')).toContain('aria-current="page"');
    expect(shell('1')).toContain('aria-current="page"');
  });

  it('renders the page content in both states', () => {
    expect(shell('0')).toContain('content');
    expect(shell('1')).toContain('content');
  });
});
