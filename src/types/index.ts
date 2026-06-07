export type Frequency =
  | 'weekly'
  | 'biweekly'
  | 'monthly'
  | 'quarterly'
  | 'annually'
  | 'one-time';

export interface Account {
  id: number;
  name: string;
  balance: number;
  is_primary: 0 | 1;
  sort_order: number | null;
  created_at: string;
  updated_at: string;
}

export type GroupKind = 'income' | 'expense' | 'debt';

export interface LineItemGroup {
  id: number;
  name: string;
  kind: GroupKind;
  created_at: string;
  updated_at: string;
}

export interface IncomeSource {
  id: number;
  name: string;
  monthly_amount: number;
  frequency: Frequency;
  group_id: number | null;
  start_date: string | null; // YYYY-MM-DD; null = starts now / always
  account_id: number | null; // which cash account it lands in; null = primary
  created_at: string;
  updated_at: string;
}

export type AllocationSourceType = 'account' | 'debt';
export type AllocationType = 'percent' | 'fixed';

export interface ExpenseAllocation {
  source_type: AllocationSourceType; // pay from a cash account or a debt/credit line
  source_id: number | null;
  alloc_type: AllocationType; // a percentage of the bill, or a fixed dollar amount
  value: number;
}

export interface FundingRule extends ExpenseAllocation {
  frequency: Frequency; // how often this source contributes while the rule is active
  start_date: string | null; // YYYY-MM-DD; null = active now / always
  end_date: string | null; // YYYY-MM-DD; null = ongoing
}

export interface Expense {
  id: number;
  name: string;
  monthly_amount: number; // amount per occurrence at the given frequency
  frequency: Frequency;
  start_date: string | null; // YYYY-MM-DD; null = now / always
  end_date: string | null; // YYYY-MM-DD; null = ongoing
  group_id: number | null;
  funding_allocations: ExpenseAllocation[]; // remainder draws from the primary account
  funding_rules: FundingRule[]; // scheduled funding plan; empty = use funding_allocations
  created_at: string;
  updated_at: string;
}

export type DebtType = 'credit_card' | 'loan';

export interface Debt {
  id: number;
  name: string;
  balance: number;
  apr: number; // annual percentage rate, e.g. 19.9
  credit_limit: number | null;
  monthly_payment: number;
  debt_type: DebtType; // credit_card = revolving (chargeable); loan = installment (not chargeable)
  payment_day: number | null; // autopay day-of-month (1-31); null = unspecified
  group_id: number | null;
  account_id: number | null; // account that pays this debt; null = primary
  funding_allocations: ExpenseAllocation[]; // split account funding for debt payments; empty = legacy account_id
  funding_rules: FundingRule[]; // scheduled account funding plan; empty = use funding_allocations/account_id
  created_at: string;
  updated_at: string;
}

export type FundingSourceType = 'cash' | 'income' | 'debt' | 'account';

export interface ScheduledPayment {
  id: number;
  name: string;
  amount: number;
  frequency: Frequency;
  start_date: string; // YYYY-MM-DD, first occurrence
  end_date: string | null; // YYYY-MM-DD, last occurrence (inclusive); null = open-ended
  funding_source_type: FundingSourceType; // what pays for it
  funding_source_id: number | null; // income/debt id when type !== 'cash'
  funding_allocations: ExpenseAllocation[]; // split funding; empty = legacy funding source
  funding_rules: FundingRule[]; // scheduled funding plan; empty = use funding_allocations/source
  created_at: string;
  updated_at: string;
}

export interface ForecastPoint {
  month: number;
  label: string;
  income: number;
  expenses: number;
  net: number;
}

export interface SavingsPoint {
  month: number;
  label: string;
  income: number;
  incomeLump: number; // portion of income arriving as a lump (quarterly/annual/one-time)
  expenses: number;
  scheduledOut: number;
  scheduledLabel: string; // names of future expenses landing this month
  debtOut: number; // debt payments this month (decline to 0 at payoff)
  net: number;
  balance: number;
}

export interface NetWorthPoint {
  month: number;
  label: string;
  cash: number;
  debt: number; // remaining debt (positive number)
  netWorth: number; // cash - debt
}

export type LineItem = IncomeSource | Expense;

export interface ItemFormData {
  name: string;
  monthly_amount: number;
  frequency?: Frequency;
  group_id?: number | null;
  start_date?: string | null;
  end_date?: string | null;
  account_id?: number | null;
  funding_allocations?: ExpenseAllocation[];
  funding_rules?: FundingRule[];
}
