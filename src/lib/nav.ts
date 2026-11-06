// The app's navigation, as data. Kept out of App.tsx so the invariant that
// every destination has a page can be tested — a nav id with no PAGE_META
// entry crashed the whole app once, because the title lookup is unguarded.
import {
  BarChart3, CreditCard, LayoutDashboard, LineChart, List, Receipt, Settings,
  Target, TrendingUp, Wallet, type LucideIcon,
} from 'lucide-react';

export interface NavItem {
  id: string;
  label: string;
  /** The component itself, not an element, so this stays a plain .ts module. */
  icon: LucideIcon;
}

export interface NavGroup {
  /** Omitted for the top-level items that need no heading. */
  heading?: string;
  items: NavItem[];
}

export type Tab =
  | 'home'
  | 'accounts' | 'income' | 'expenses' | 'debts' | 'goals'
  | 'projections' | 'breakdown' | 'transactions'
  // Labelled "Account". The id `account` belonged to the old Activity page, and
  // stored copies of it still resolve to Breakdown, so it can't be reused.
  | 'settings';

// Planning and viewing are deliberately separate: the editors live under PLAN
// and nowhere else, so a view is just a view. Each concept lives on the page of
// the thing it belongs to: buckets are money inside an account (Accounts),
// budgets are expenses with a limit (Expenses), and every per-item view of the
// forecast is a mode of Breakdown rather than a page of its own.
export const NAV: NavGroup[] = [
  { items: [{ id: 'home', label: 'Home', icon: LayoutDashboard }] },
  {
    heading: 'Plan',
    items: [
      { id: 'accounts', label: 'Accounts', icon: Wallet },
      { id: 'income', label: 'Income', icon: TrendingUp },
      { id: 'expenses', label: 'Expenses', icon: Receipt },
      { id: 'debts', label: 'Debts', icon: CreditCard },
      { id: 'goals', label: 'Goals', icon: Target },
    ],
  },
  {
    heading: 'Views',
    items: [
      { id: 'projections', label: 'Projections', icon: LineChart },
      { id: 'breakdown', label: 'Breakdown', icon: BarChart3 },
      { id: 'transactions', label: 'Transactions', icon: List },
    ],
  },
  { items: [{ id: 'settings', label: 'Account', icon: Settings }] },
];

export const TAB_IDS = NAV.flatMap((group) => group.items.map((item) => item.id)) as Tab[];

export const PAGE_META: Record<Tab, { title: string; subtitle?: string }> = {
  home: { title: 'Home', subtitle: 'Where you stand, and what’s coming' },
  accounts: { title: 'Accounts', subtitle: 'Where your cash sits, and what’s set aside in it' },
  income: { title: 'Income', subtitle: 'Money coming in, by pay frequency' },
  expenses: { title: 'Expenses', subtitle: 'Bills, one-offs, and budgets for what varies' },
  debts: { title: 'Debts', subtitle: 'Balances, payoff strategy, and projected free dates' },
  goals: { title: 'Goals', subtitle: 'Where you’re trying to get to, and when the plan gets you there' },
  projections: { title: 'Projections', subtitle: 'Cash flow, savings and net worth over time' },
  breakdown: { title: 'Breakdown', subtitle: 'The forecast item by item — over time, one month, or one account' },
  transactions: { title: 'Transactions', subtitle: 'Synced from your linked institutions' },
  settings: { title: 'Account', subtitle: 'Your profile, how the app looks, and your data' },
};

// The four chart tabs that used to be separate are one page with a switcher.
export type ProjectionView = 'cashflow' | 'savings' | 'networth' | 'overview';

export const PROJECTION_VIEWS: [ProjectionView, string][] = [
  ['cashflow', 'Cash flow'],
  ['savings', 'Savings'],
  ['networth', 'Net worth'],
  ['overview', 'Overview'],
];

export const PROJECTION_IDS = PROJECTION_VIEWS.map(([id]) => id);

// Breakdown's modes. `account` and `outflows` were pages of their own.
export type BreakdownMode = 'range' | 'month' | 'account' | 'outflows';

export const BREAKDOWN_VIEWS: [BreakdownMode, string][] = [
  ['range', 'Over time'],
  ['month', 'One month'],
  ['account', 'One account'],
  ['outflows', 'Who pays'],
];

export const BREAKDOWN_MODES = BREAKDOWN_VIEWS.map(([id]) => id);
