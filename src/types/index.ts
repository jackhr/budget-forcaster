export type Frequency =
  | 'weekly'
  | 'biweekly'
  | 'monthly'
  | 'quarterly'
  | 'annually'
  | 'one-time';

export type GroupKind = 'income' | 'expense';

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
  created_at: string;
  updated_at: string;
}

export interface Expense {
  id: number;
  name: string;
  monthly_amount: number;
  group_id: number | null;
  created_at: string;
  updated_at: string;
}

export interface Debt {
  id: number;
  name: string;
  balance: number;
  apr: number; // annual percentage rate, e.g. 19.9
  credit_limit: number | null;
  monthly_payment: number;
  created_at: string;
  updated_at: string;
}

export interface ScheduledPayment {
  id: number;
  name: string;
  amount: number;
  frequency: Frequency;
  start_date: string; // YYYY-MM-DD, first occurrence
  end_date: string | null; // YYYY-MM-DD, last occurrence (inclusive); null = open-ended
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

export type LineItem = IncomeSource | Expense;

export interface ItemFormData {
  name: string;
  monthly_amount: number;
  frequency?: Frequency;
  group_id?: number | null;
}
