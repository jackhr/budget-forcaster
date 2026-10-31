import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import AppShell from './AppShell';
import Home from './Home';
import type { Breakdown } from '../lib/forecast';
import type { MonthBreakdown } from '../lib/monthlyBreakdown';
import { AuthProvider } from '../auth/AuthProvider';
import { LayoutDashboard, Receipt } from 'lucide-react';

const NAV = [
  { items: [{ id: 'home', label: 'Home', icon: LayoutDashboard }] },
  { heading: 'Plan', items: [{ id: 'expenses', label: 'Expenses', icon: Receipt }] },
];

const series = (name: string, values: number[]) => ({ id: 1, name, values });
function bd(vals: number[]): Breakdown {
  return { labels: vals.map((_, i) => `M${i}`), total: vals, series: [series('Checking', vals)] };
}
const month = (events: MonthBreakdown['events']): MonthBreakdown => ({
  year: 2026, month: 9, label: 'Oct', days: 31, events, daily: [], totalIn: 0, totalOut: 0, net: 0, liquidity: [],
});
const nw = [{ month: 1, label: 'Oct 26', cash: 10944, debt: 49364, netWorth: -38420 }];

describe('AppShell', () => {
  it('renders grouped nav, marks the current page, and shows the title', () => {
    const html = renderToStaticMarkup(
      <AuthProvider>
        <AppShell groups={NAV} current="home" onSelect={() => {}} title="Home" subtitle="Where you stand">
          <p>content</p>
        </AppShell>
      </AuthProvider>,
    );
    expect(html).toContain('Budget Forecaster');
    expect(html).toContain('Plan');           // group heading
    expect(html).toContain('aria-current="page"');
    expect(html).toContain('Where you stand');
    expect(html).toContain('content');
  });
});

describe('Home', () => {
  it('warns when an account is projected negative, naming it and the month', () => {
    const html = renderToStaticMarkup(
      <Home totalCash={10944} netWorth={nw} accountSeries={bd([900, 400, -1204])}
        monthBreakdowns={[]} onGoToPlan={() => {}} onGoToProjections={() => {}} />,
    );
    expect(html).toContain('Heads up');
    expect(html).toContain('Checking is projected to reach');
    expect(html).toContain('M2');
    expect(html).toContain('-$1,204.00');
  });

  it('says you are on track when nothing goes negative', () => {
    const html = renderToStaticMarkup(
      <Home totalCash={10944} netWorth={nw} accountSeries={bd([900, 400, 1200])}
        monthBreakdowns={[]} onGoToPlan={() => {}} onGoToProjections={() => {}} />,
    );
    expect(html).toContain('On track');
    expect(html).toContain('No account is projected to go negative');
    expect(html).toContain('Cash is lowest in M1');
  });

  it('lists upcoming money in and out with a net', () => {
    const today = new Date();
    const iso = (d: number) => {
      const x = new Date(today); x.setDate(x.getDate() + d);
      return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
    };
    const ev = (name: string, dir: 'in' | 'out', amount: number, d: number) => ({
      key: name, day: 1, date: iso(d), name, kind: 'expense' as const, direction: dir,
      amount, detail: '', paid: false, dateSpecified: true, liquidityChanges: [],
    });
    const html = renderToStaticMarkup(
      <Home totalCash={10944} netWorth={nw} accountSeries={bd([900])}
        monthBreakdowns={[month([ev('Paycheck', 'in', 3640, 2), ev('Mortgage', 'out', 7365, 5)])]}
        onGoToPlan={() => {}} onGoToProjections={() => {}} />,
    );
    expect(html).toContain('Next 30 days');
    expect(html).toContain('Paycheck');
    expect(html).toContain('Mortgage');
    expect(html).toContain('$3,640 in');
    expect(html).toContain('$7,365 out');
  });

  it('shows the three headline numbers', () => {
    const html = renderToStaticMarkup(
      <Home totalCash={10944} netWorth={nw} accountSeries={bd([900])}
        monthBreakdowns={[]} onGoToPlan={() => {}} onGoToProjections={() => {}} />,
    );
    expect(html).toContain('Net worth');
    expect(html).toContain('-$38,420');
    expect(html).toContain('Cash on hand');
    expect(html).toContain('$10,944');
    expect(html).toContain('Total debt');
  });
});
