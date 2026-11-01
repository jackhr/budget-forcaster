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
const nw = [{ month: 1, label: 'Oct 26', cash: 12500, debt: 40000, netWorth: -27500 }];
const stamps = { created_at: '2026-01-01', updated_at: '2026-01-01' };
const accounts = [
  { id: 1, name: 'Checking', balance: 4500, is_primary: 1 as const, sort_order: 0, ...stamps },
  { id: 2, name: 'Savings', balance: 8000, is_primary: 0 as const, sort_order: 1, ...stamps },
];
const debts = [{
  id: 7, name: 'Rewards card', balance: 2600, apr: 19.9, credit_limit: 2000,
  monthly_payment: 120, debt_type: 'credit_card' as const, payment_day: 10,
  group_id: null, account_id: 1, funding_allocations: [], funding_rules: [], ...stamps,
}];

/** Everything Home needs beyond what a given test is actually asserting. */
const homeProps = {
  layout: 'runway' as const, onLayoutChange: () => {}, totalCash: 12500, netWorth: nw,
  accounts, debts, monthBreakdowns: [], onGoToPlan: () => {}, onGoToProjections: () => {},
  onGoToAccounts: () => {}, onGoToDebts: () => {},
};

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
      <Home {...homeProps} accountSeries={bd([900, 400, -1200])} />,
    );
    expect(html).toContain('Heads up');
    expect(html).toContain('Checking is projected to reach');
    expect(html).toContain('M2');
    expect(html).toContain('-$1,200.00');
  });

  it('says you are on track when nothing goes negative', () => {
    const html = renderToStaticMarkup(
      <Home {...homeProps} accountSeries={bd([900, 400, 1200])} />,
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
      <Home {...homeProps} accountSeries={bd([900])}
        monthBreakdowns={[month([ev('Paycheck', 'in', 3200, 2), ev('Mortgage', 'out', 4100, 5)])]} />,
    );
    expect(html).toContain('Next 30 days');
    expect(html).toContain('Paycheck');
    expect(html).toContain('Mortgage');
    expect(html).toContain('$3,200 in');
    expect(html).toContain('$4,100 out');
  });

  it('shows the three headline numbers', () => {
    const html = renderToStaticMarkup(
      <Home {...homeProps} accountSeries={bd([900])} />,
    );
    expect(html).toContain('Net worth');
    expect(html).toContain('-$27,500');
    expect(html).toContain('Cash on hand');
    expect(html).toContain('$12,500');
    expect(html).toContain('Total debt');
  });
});

describe('Home layouts', () => {
  it('leads with the runway risk by default', () => {
    const html = renderToStaticMarkup(
      <Home {...homeProps} accountSeries={bd([900, 400, -1200])} />,
    );
    expect(html).toContain('Heads up');
    expect(html).not.toContain('Where the money is');
  });

  it('leads with net worth and both sides on the balance sheet', () => {
    const html = renderToStaticMarkup(
      <Home {...homeProps} layout="balance" accountSeries={bd([900, 400, -1200])} />,
    );
    expect(html).toContain('Where the money is');
    expect(html).toContain('What&#x27;s owed');
    expect(html).toContain('Savings');
    expect(html).toContain('Rewards card');
    // The risk banner belongs to the other layout.
    expect(html).not.toContain('Heads up');
    // Exactly one net-worth total on screen. The headline stat is today-ish,
    // the two sides are today's balances, and a second big total labelled the
    // same thing on a different basis is how a money screen loses trust.
    expect(html.match(/Net worth/g)!.length).toBe(1);
  });

  it('flags a card over its limit on the balance sheet', () => {
    const html = renderToStaticMarkup(
      <Home {...homeProps} layout="balance" accountSeries={bd([900])} />,
    );
    expect(html).toContain('over limit');
  });

  it('shows the next 30 days in both layouts', () => {
    for (const layout of ['runway', 'balance'] as const) {
      const html = renderToStaticMarkup(
        <Home {...homeProps} layout={layout} accountSeries={bd([900])} />,
      );
      expect({ layout, hasUpcoming: html.includes('Next 30 days') }).toEqual({ layout, hasUpcoming: true });
    }
  });

  it('offers every layout in the picker, marking the current one', () => {
    const html = renderToStaticMarkup(
      <Home {...homeProps} layout="balance" accountSeries={bd([900])} />,
    );
    expect(html).toContain('Runway &amp; safety');
    expect(html).toContain('Balance sheet');
    expect(html).toContain('aria-pressed="true"');
  });
});
