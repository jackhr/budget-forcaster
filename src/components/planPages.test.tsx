import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { Debt, Expense, IncomeSource, LineItemGroup } from '../types';
import type { DebtPlan } from '../lib/debt';
import { ACCENTS, Button, Pill } from '../ui';
import { GroupBar } from '../ui/GroupBar';
import LineItemRow from './LineItemRow';
import LineItemTable from './LineItemTable';
import Debts from './Debts';

const noop = async () => {};
const stamps = { created_at: '2026-01-01', updated_at: '2026-01-01' };

const income: IncomeSource = {
  id: 1, name: 'Paycheck', monthly_amount: 2400, frequency: 'semimonthly',
  payday_1: 15, payday_2: 31, group_id: null, start_date: '2026-01-15', account_id: 1, ...stamps,
};

const expense: Expense = {
  id: 2, name: 'Electricity', monthly_amount: 180, frequency: 'monthly',
  start_date: '2026-01-01', end_date: null, group_id: null,
  funding_allocations: [], funding_rules: [], ...stamps,
};

const debt: Debt = {
  id: 3, name: 'Rewards card', balance: 4200, apr: 19.9, credit_limit: 5000,
  monthly_payment: 150, debt_type: 'credit_card', payment_day: 12, group_id: null,
  account_id: 1, funding_allocations: [], funding_rules: [], ...stamps,
};

const group: LineItemGroup = { id: 9, name: 'Utilities', kind: 'expense', ...stamps };

const plan: DebtPlan = {
  outflow: [150], outflowByDebt: new Map([[3, [150]]]), remaining: [4100],
  remainingByDebt: new Map([[3, [4100]]]), interestByDebt: new Map([[3, [69]]]),
  payoffMonthByDebt: new Map([[3, 34]]), overLimitByDebt: new Map([[3, null]]),
  chargeOverflow: [0], totalInterest: 1200, debtFreeMonthIndex: 34,
};

const tableProps = {
  groups: [group], kind: 'expense' as const, onUpdate: noop, onDelete: noop, onAdd: noop,
  onAddGroup: noop, onRenameGroup: noop, onDeleteGroup: noop, onReorder: () => {}, onReorderGroup: () => {},
};

const debtsProps = {
  groups: [], accounts: [{ id: 1, name: 'Checking', is_primary: 1 as const }],
  onAdd: noop, onUpdate: noop, onDelete: noop, onAddGroup: noop, onRenameGroup: noop,
  onDeleteGroup: noop, onReorder: () => {}, onReorderGroup: () => {},
  plan, basePlan: plan, extra: 0, strategy: 'none' as const,
  onExtraChange: () => {}, onStrategyChange: () => {},
  isPaidThisMonth: () => false, onTogglePaid: () => {},
};

/**
 * The migration's actual guarantee. An inline `style` attribute is how the old
 * UI drifted: each component decided its own spacing and color locally. These
 * pages now get both from the shared primitives, so markup carrying a `style`
 * is a regression — barring the handful of genuinely computed values below.
 */
function inlineStyles(html: string): string[] {
  return [...html.matchAll(/style="([^"]*)"/g)].map((m) => m[1]);
}

describe('no inline styling on the plan pages', () => {
  it('renders an income row from utilities alone', () => {
    const html = renderToStaticMarkup(
      <LineItemRow item={income} onUpdate={noop} onDelete={noop} accent="income" showFrequency showAccount />,
    );
    expect(inlineStyles(html)).toEqual([]);
  });

  it('renders an expense row from utilities alone', () => {
    const html = renderToStaticMarkup(
      <LineItemRow item={expense} onUpdate={noop} onDelete={noop} accent="expense" showFrequency showFunding
        paid={false} onTogglePaid={() => {}} />,
    );
    expect(inlineStyles(html)).toEqual([]);
  });

  it('renders a whole table from utilities alone', () => {
    const html = renderToStaticMarkup(
      <LineItemTable {...tableProps} title="Expenses" items={[expense]} accent="expense"
        totalLabel="Total Per Payment" showFrequency showFunding />,
    );
    expect(inlineStyles(html)).toEqual([]);
  });

  it('renders the debts panel from utilities alone', () => {
    const html = renderToStaticMarkup(<Debts {...debtsProps} debts={[debt]} />);
    expect(inlineStyles(html)).toEqual([]);
  });
});

describe('accents', () => {
  it('gives every accent the same set of classes', () => {
    const keys = Object.values(ACCENTS).map((a) => Object.keys(a).sort().join(','));
    expect(new Set(keys).size).toBe(1);
  });

  it('keeps every accent class a literal Tailwind utility', () => {
    // A runtime `var(--color-x)` or an interpolated string is invisible to
    // Tailwind's scanner, so the utility would never be generated.
    for (const [name, classes] of Object.entries(ACCENTS)) {
      for (const [slot, value] of Object.entries(classes)) {
        expect({ name, slot, value }).toEqual({ name, slot, value: expect.not.stringContaining('var(') });
        expect({ name, slot, value }).toEqual({ name, slot, value: expect.not.stringContaining('${') });
      }
    }
  });

  it('colors the three accents differently', () => {
    const texts = Object.values(ACCENTS).map((a) => a.text);
    expect(new Set(texts).size).toBe(texts.length);
  });

  it('uses its accent for the amount and the rule, not a hardcoded color', () => {
    const html = renderToStaticMarkup(
      <LineItemRow item={income} onUpdate={noop} onDelete={noop} accent="income" showFrequency showAccount />,
    );
    expect(html).toContain(ACCENTS.income.text);
    expect(html).toContain(ACCENTS.income.bar);
    expect(html).not.toContain(ACCENTS.expense.text);
  });
});

describe('variant and caller classes never compete', () => {
  // Two utilities for the same property in the same layer are resolved by
  // stylesheet order, not by which one the caller meant. `bare` exists so a
  // caller supplying a fill has nothing to race.
  const COLOR = /\b(bg|text|border)-(?!transparent)(surface|muted|primary|text|border)/;

  it('leaves a bare button with no color of its own', () => {
    const html = renderToStaticMarkup(<Button variant="bare" className="bg-income">Save</Button>);
    const classes = html.match(/class="([^"]*)"/)![1];
    expect(classes).toContain('bg-income');
    expect(classes).not.toMatch(COLOR);
  });

  it('still colors the standard variants', () => {
    const html = renderToStaticMarkup(<Button variant="secondary">Edit</Button>);
    expect(html).toMatch(COLOR);
  });

  it('tints a pill through its tone rather than an override', () => {
    for (const tone of ['income', 'expense', 'debt'] as const) {
      const html = renderToStaticMarkup(<Pill tone={tone}>Weekly</Pill>);
      const classes = html.match(/class="([^"]*)"/)![1];
      // One text color, one background, one border — never two of any.
      expect({ tone, text: (classes.match(/\btext-[\w-]+/g) ?? []).length }).toEqual({ tone, text: 1 });
      expect({ tone, bg: (classes.match(/\bbg-[\w-]+/g) ?? []).length }).toEqual({ tone, bg: 1 });
    }
  });
});

describe('grouping is one shared control', () => {
  it('shows the count, the subtotal and an ungroup action', () => {
    const html = renderToStaticMarkup(
      <GroupBar accent="expense" name="Utilities" count={2} noun="item" subtotal="$310"
        collapsed onToggle={() => {}} onRename={() => {}} onDelete={() => {}}>
        <p>rows</p>
      </GroupBar>,
    );
    expect(html).toContain('Utilities');
    expect(html).toContain('2 items');
    expect(html).toContain('$310');
    expect(html).toContain('Ungroup');
    expect(inlineStyles(html)).toEqual([]);
  });

  it('hides its rows while collapsed and shows them when open', () => {
    const shut = renderToStaticMarkup(
      <GroupBar accent="debt" name="Cards" count={1} noun="debt" subtotal="$1"
        collapsed onToggle={() => {}} onRename={() => {}} onDelete={() => {}}>
        <p>a row</p>
      </GroupBar>,
    );
    const open = renderToStaticMarkup(
      <GroupBar accent="debt" name="Cards" count={1} noun="debt" subtotal="$1"
        collapsed={false} onToggle={() => {}} onRename={() => {}} onDelete={() => {}}>
        <p>a row</p>
      </GroupBar>,
    );
    expect(shut).not.toContain('a row');
    expect(open).toContain('a row');
  });

  it('says ungrouping keeps the items', () => {
    const html = renderToStaticMarkup(
      <GroupBar accent="income" name="Salary" count={1} noun="item" subtotal="$1"
        collapsed onToggle={() => {}} onRename={() => {}} onDelete={() => {}}>
        <p>rows</p>
      </GroupBar>,
    );
    expect(html).toContain('keeps items, ungrouped');
  });
});
