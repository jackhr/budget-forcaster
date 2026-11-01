// The app's navigation, as data. Kept out of App.tsx so the invariant that
// every destination has a page can be tested — a nav id with no PAGE_META
// entry crashed the whole app once, because the title lookup is unguarded.
import {
  ArrowLeftRight, ArrowUpRight, BarChart3, CreditCard, LayoutDashboard,
  LineChart, List, Receipt, Settings, TrendingUp, Wallet, type LucideIcon,
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
  | 'accounts' | 'income' | 'expenses' | 'debts'
  | 'projections' | 'breakdown' | 'account' | 'outflows' | 'transactions'
  // Labelled "Account"; the id `account` was already taken by the Activity view.
  | 'settings';

// Planning and viewing are deliberately separate: the editors live under PLAN
// and nowhere else, so a view is just a view.
export const NAV: NavGroup[] = [
  { items: [{ id: 'home', label: 'Home', icon: LayoutDashboard }] },
  {
    heading: 'Plan',
    items: [
      { id: 'accounts', label: 'Accounts', icon: Wallet },
      { id: 'income', label: 'Income', icon: TrendingUp },
      { id: 'expenses', label: 'Expenses', icon: Receipt },
      { id: 'debts', label: 'Debts', icon: CreditCard },
    ],
  },
  {
    heading: 'Views',
    items: [
      { id: 'projections', label: 'Projections', icon: LineChart },
      { id: 'breakdown', label: 'Breakdown', icon: BarChart3 },
      { id: 'account', label: 'Activity', icon: ArrowLeftRight },
      { id: 'outflows', label: 'Outflows', icon: ArrowUpRight },
      { id: 'transactions', label: 'Transactions', icon: List },
    ],
  },
  { items: [{ id: 'settings', label: 'Account', icon: Settings }] },
];

export const TAB_IDS = NAV.flatMap((group) => group.items.map((item) => item.id)) as Tab[];

export const PAGE_META: Record<Tab, { title: string; subtitle?: string }> = {
  home: { title: 'Home', subtitle: 'Where you stand, and what’s coming' },
  accounts: { title: 'Accounts', subtitle: 'The cash piles income lands in and bills are paid from' },
  income: { title: 'Income', subtitle: 'Money coming in, by pay frequency' },
  expenses: { title: 'Expenses', subtitle: 'Ongoing and time-boxed costs, and what funds each' },
  debts: { title: 'Debts', subtitle: 'Balances, payoff strategy, and projected free dates' },
  projections: { title: 'Projections', subtitle: 'Cash flow, savings and net worth over time' },
  breakdown: { title: 'Breakdown', subtitle: 'Item by item, by range or by month' },
  account: { title: 'Activity', subtitle: 'What moves in and out of one account or debt' },
  outflows: { title: 'Outflows', subtitle: 'What each account pays for, month by month' },
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
