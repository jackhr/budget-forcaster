// The three accents the planning pages are colored by. Components take the
// semantic name and look the classes up here, rather than being handed a color
// string — Tailwind can only generate utilities it can see as literal text, and
// a runtime `var(--color-x)` can't be tinted or given an alpha.
export type Accent = 'income' | 'expense' | 'debt';

interface AccentClasses {
  /** Amounts, subtotals and totals. */
  text: string;
  /** The rule down the left edge of a row, as a filled block. */
  bar: string;
  /** The same rule as a left border, for a band that wraps content. */
  rail: string;
  /** The dashed "+ Add …" affordance. */
  dashed: string;
  /** A filled button in this accent — the save/create action. */
  solid: string;
}

export const ACCENTS: Record<Accent, AccentClasses> = {
  income: {
    text: 'text-income',
    bar: 'bg-income',
    rail: 'border-l-income',
    dashed: 'text-income border-income/55 hover:border-income hover:bg-income/10',
    solid: 'bg-income text-white hover:bg-income/90',
  },
  expense: {
    text: 'text-expense',
    bar: 'bg-expense',
    rail: 'border-l-expense',
    dashed: 'text-expense border-expense/55 hover:border-expense hover:bg-expense/10',
    solid: 'bg-expense text-white hover:bg-expense/90',
  },
  // Debt reads as neither income nor expense: a balance, not a flow.
  debt: {
    text: 'text-net-neg',
    bar: 'bg-net-neg',
    rail: 'border-l-net-neg',
    dashed: 'text-net-neg border-net-neg/55 hover:border-net-neg hover:bg-net-neg/10',
    solid: 'bg-net-neg text-white hover:bg-net-neg/90',
  },
};
