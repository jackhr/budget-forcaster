import type { Account, Debt, Expense, GroupKind, IncomeSource, LineItemGroup, ScheduledPayment } from '../types';

const BASE = '/api';

async function req<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error ?? `HTTP ${res.status}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

type IncomeInput = Omit<IncomeSource, 'id' | 'created_at' | 'updated_at'>;
type ExpenseInput = Omit<Expense, 'id' | 'created_at' | 'updated_at'>;
type ScheduledInput = Omit<ScheduledPayment, 'id' | 'created_at' | 'updated_at'>;

const reorder = (resource: string, ids: number[]) =>
  req<{ ok: boolean }>(`/${resource}/reorder`, { method: 'POST', body: JSON.stringify({ ids }) });

export const incomeApi = {
  getAll: () => req<IncomeSource[]>('/income'),
  create: (data: IncomeInput) =>
    req<IncomeSource>('/income', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: number, data: Partial<IncomeInput>) =>
    req<IncomeSource>(`/income/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id: number) => req<void>(`/income/${id}`, { method: 'DELETE' }),
  reorder: (ids: number[]) => reorder('income', ids),
};

export const expensesApi = {
  getAll: () => req<Expense[]>('/expenses'),
  create: (data: ExpenseInput) =>
    req<Expense>('/expenses', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: number, data: Partial<ExpenseInput>) =>
    req<Expense>(`/expenses/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id: number) => req<void>(`/expenses/${id}`, { method: 'DELETE' }),
  reorder: (ids: number[]) => reorder('expenses', ids),
};

export const scheduledApi = {
  getAll: () => req<ScheduledPayment[]>('/scheduled'),
  create: (data: ScheduledInput) =>
    req<ScheduledPayment>('/scheduled', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: number, data: Partial<ScheduledInput>) =>
    req<ScheduledPayment>(`/scheduled/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id: number) => req<void>(`/scheduled/${id}`, { method: 'DELETE' }),
};

export const groupsApi = {
  getAll: () => req<LineItemGroup[]>('/groups'),
  create: (data: { name: string; kind: GroupKind }) =>
    req<LineItemGroup>('/groups', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: number, data: { name: string }) =>
    req<LineItemGroup>(`/groups/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id: number) => req<void>(`/groups/${id}`, { method: 'DELETE' }),
  reorder: (ids: number[]) => reorder('groups', ids),
};

export interface Scenario {
  id: number;
  name: string;
  snapshot: unknown;
  created_at: string;
}

export const scenariosApi = {
  getAll: () => req<Scenario[]>('/scenarios'),
  save: (name: string) =>
    req<Scenario>('/scenarios', { method: 'POST', body: JSON.stringify({ name }) }),
  restore: (id: number) =>
    req<{ ok: boolean }>(`/scenarios/${id}/restore`, { method: 'POST' }),
  delete: (id: number) => req<void>(`/scenarios/${id}`, { method: 'DELETE' }),
};

export const dataApi = {
  export: () => req<{ version: number; exported_at: string; data: unknown }>('/export'),
  import: (data: unknown) =>
    req<{ ok: boolean }>('/import', { method: 'POST', body: JSON.stringify({ data }) }),
};

type DebtInput = Omit<Debt, 'id' | 'created_at' | 'updated_at'>;

type AccountInput = Omit<Account, 'id' | 'created_at' | 'updated_at'>;

export const accountsApi = {
  getAll: () => req<Account[]>('/accounts'),
  create: (data: { name: string; balance: number; is_primary?: 0 | 1 }) =>
    req<Account>('/accounts', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: number, data: Partial<AccountInput>) =>
    req<Account>(`/accounts/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id: number) => req<void>(`/accounts/${id}`, { method: 'DELETE' }),
  reorder: (ids: number[]) => reorder('accounts', ids),
};

export const debtsApi = {
  getAll: () => req<Debt[]>('/debts'),
  create: (data: DebtInput) =>
    req<Debt>('/debts', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: number, data: Partial<DebtInput>) =>
    req<Debt>(`/debts/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id: number) => req<void>(`/debts/${id}`, { method: 'DELETE' }),
  reorder: (ids: number[]) => reorder('debts', ids),
};

export const settingsApi = {
  getAll: () => req<Record<string, string>>('/settings'),
  set: (key: string, value: string | number) =>
    req<{ key: string; value: string }>(`/settings/${key}`, {
      method: 'PUT',
      body: JSON.stringify({ value }),
    }),
};

// ---- Plaid (sandbox) ----
export interface PlaidItem { id: number; item_id: string; institution_name: string | null; created_at: string }
export interface PlaidStatus { configured: boolean; env: string; items: PlaidItem[] }
export interface PlaidAccount {
  item_id: string;
  institution_name: string | null;
  account_id: string;
  name: string;
  official_name: string | null;
  mask: string | null;
  type: string;
  subtype: string | null;
  current: number | null;
  available: number | null;
  limit: number | null;
  currency: string | null;
  imported: boolean; // already imported as a local account/debt
}

export interface PlaidTransaction {
  transaction_id: string;
  account_id: string;
  date: string; // YYYY-MM-DD
  name: string;
  amount: number; // positive = money out (a charge); negative = refund/payment
  currency: string | null;
  pending: boolean;
  category: string | null;
  logo_url: string | null;
}

export const plaidApi = {
  status: () => req<PlaidStatus>('/plaid/status'),
  createLinkToken: () => req<{ link_token: string }>('/plaid/create_link_token', { method: 'POST' }),
  exchange: (publicToken: string) =>
    req<{ ok: boolean; item_id: string; institution_name: string | null }>('/plaid/exchange_public_token', {
      method: 'POST', body: JSON.stringify({ public_token: publicToken }),
    }),
  accounts: () => req<PlaidAccount[]>('/plaid/accounts'),
  transactions: (accountId: string | null, days = 90) =>
    req<PlaidTransaction[]>(`/plaid/transactions?days=${days}${accountId ? `&account_id=${encodeURIComponent(accountId)}` : ''}`),
  syncTransactions: () =>
    req<{ ok: boolean; added: number; modified: number; removed: number }>('/plaid/transactions/sync', { method: 'POST' }),
  importAccounts: (accounts: { account_id: string; name: string; balance: number; type: string; mask?: string | null; credit_limit?: number | null }[]) =>
    req<{ ok: boolean; created: number; accountsCreated: number; debtsCreated: number; skipped: number }>('/plaid/import_accounts', { method: 'POST', body: JSON.stringify({ accounts }) }),
  resync: (itemId?: string) =>
    req<{ ok: boolean; updated: number }>('/plaid/resync', { method: 'POST', body: JSON.stringify(itemId ? { item_id: itemId } : {}) }),
  removeItem: (id: number) => req<void>(`/plaid/items/${id}`, { method: 'DELETE' }),
};
